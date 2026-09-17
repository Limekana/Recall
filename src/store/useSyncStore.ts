import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { recallRepository } from '../db/repository';
import { decideSync, hashSnapshot, isRecallSnapshot, snapshotHasData, type RemoteSnapshot } from '../sync/syncEngine';
import { supabase, syncConfigured } from '../sync/supabase';
import type { RecallSnapshot, SyncMetadata } from '../types';
import { useRecallStore } from './useRecallStore';

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'conflict' | 'error';

interface SyncConflict {
  local: RecallSnapshot;
  localHash: string;
  remote: RemoteSnapshot;
}

interface SyncState {
  configured: boolean;
  session: Session | null;
  authReady: boolean;
  status: SyncStatus;
  autoSync: boolean;
  lastSyncedAt: number | null;
  conflict: SyncConflict | null;
  notice: string | null;
  error: string | null;
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
  resolveConflict: (choice: 'device' | 'cloud') => Promise<void>;
  dismissConflict: () => void;
  setAutoSync: (enabled: boolean) => Promise<void>;
  clearMessage: () => void;
}

interface SyncRow {
  user_id: string;
  revision: number;
  payload: unknown;
  payload_hash: string;
  device_id: string;
  updated_at: string;
}

let initialized = false;
let activeSync: Promise<void> | null = null;

function deviceLabel(): string {
  const platform = navigator.userAgent.includes('Android') ? 'Android phone' : navigator.platform || 'Web device';
  return `${platform} · ${navigator.userAgent.includes('wv') ? 'Recall app' : 'Web'}`;
}

async function ensureMetadata(userId?: string): Promise<SyncMetadata> {
  const existing = await recallRepository.loadSyncMetadata();
  if (existing) {
    if (!userId || existing.userId === userId) return existing;
    const reset = {
      ...existing,
      userId,
      lastSyncedRevision: 0,
      lastSyncedHash: '',
      lastSyncedAt: null
    };
    await recallRepository.putSyncMetadata(reset);
    return reset;
  }
  const metadata: SyncMetadata = {
    id: 'primary',
    userId: userId ?? null,
    deviceId: crypto.randomUUID(),
    deviceLabel: deviceLabel(),
    lastSyncedRevision: 0,
    lastSyncedHash: '',
    lastSyncedAt: null,
    autoSync: true
  };
  await recallRepository.putSyncMetadata(metadata);
  return metadata;
}

function mapRemote(row: SyncRow): RemoteSnapshot {
  if (!isRecallSnapshot(row.payload)) throw new Error('The cloud copy uses an unsupported Recall data format.');
  return {
    revision: row.revision,
    payload: row.payload,
    payloadHash: row.payload_hash,
    deviceId: row.device_id,
    updatedAt: row.updated_at
  };
}

async function fetchRemote(): Promise<RemoteSnapshot | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('recall_sync_state')
    .select('user_id, revision, payload, payload_hash, device_id, updated_at')
    .maybeSingle<SyncRow>();
  if (error) throw error;
  return data ? mapRemote(data) : null;
}

async function pushSnapshot(
  snapshot: RecallSnapshot,
  payloadHash: string,
  metadata: SyncMetadata,
  expectedRevision: number
): Promise<RemoteSnapshot> {
  if (!supabase) throw new Error('Cloud sync is not configured in this build.');
  const { data, error } = await supabase
    .rpc('sync_recall_snapshot', {
      expected_revision: expectedRevision,
      next_payload: snapshot,
      next_hash: payloadHash,
      next_device_id: metadata.deviceId
    })
    .single<SyncRow>();
  if (error) throw error;
  return mapRemote(data);
}

async function saveSyncedMetadata(metadata: SyncMetadata, remote: RemoteSnapshot): Promise<SyncMetadata> {
  const next: SyncMetadata = {
    ...metadata,
    lastSyncedRevision: remote.revision,
    lastSyncedHash: remote.payloadHash,
    lastSyncedAt: Date.now()
  };
  await recallRepository.putSyncMetadata(next);
  return next;
}

function messageFrom(error: unknown): string {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error && 'message' in error && typeof error.message === 'string'
      ? error.message
      : 'Sync could not finish. Your local library is safe.';
  if (/relation .*recall_sync_state.* does not exist|function .*sync_recall_snapshot/i.test(message)) {
    return 'The Recall sync database is not ready yet. Your local library is unchanged.';
  }
  return message;
}

export const useSyncStore = create<SyncState>((set, get) => ({
  configured: syncConfigured,
  session: null,
  authReady: false,
  status: 'idle',
  autoSync: true,
  lastSyncedAt: null,
  conflict: null,
  notice: null,
  error: null,

  initialize: async () => {
    if (initialized) return;
    initialized = true;
    const metadata = await ensureMetadata();
    set({ autoSync: metadata.autoSync, lastSyncedAt: metadata.lastSyncedAt });

    if (!supabase) {
      set({ authReady: true });
      return;
    }

    const { data, error } = await supabase.auth.getSession();
    if (error) {
      set({ authReady: true, error: error.message });
      return;
    }
    set({ authReady: true, session: data.session });

    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, error: null, notice: null, status: session ? 'idle' : 'idle' });
      if (session) window.setTimeout(() => void get().syncNow(), 0);
    });

    if (data.session) void get().syncNow();
  },

  signIn: async (email, password) => {
    if (!supabase) return;
    set({ error: null, notice: null });
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) set({ error: error.message });
  },

  signUp: async (email, password) => {
    if (!supabase) return;
    set({ error: null, notice: null });
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) {
      set({ error: error.message });
      return;
    }
    set({
      session: data.session,
      notice: data.session ? 'Account created. Sync is ready.' : 'Account created. Confirm the email, then sign in here.'
    });
  },

  signOut: async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) {
      set({ error: error.message });
      return;
    }
    set({ session: null, status: 'idle', conflict: null, notice: 'Signed out. Local study data remains on this device.' });
  },

  syncNow: async () => {
    if (activeSync) return activeSync;
    const run = async () => {
      if (!get().session || !supabase) return;
      set({ status: 'syncing', error: null, notice: null });
      try {
        const [local, metadata, remote] = await Promise.all([
          recallRepository.exportSnapshot(),
          ensureMetadata(get().session!.user.id),
          fetchRemote()
        ]);
        const localHash = await hashSnapshot(local);
        const decision = decideSync({ localHash, localHasData: snapshotHasData(local), metadata, remote });

        if (decision === 'conflict' && remote) {
          set({ status: 'conflict', conflict: { local, localHash, remote } });
          return;
        }

        let syncedRemote = remote;
        if (decision === 'push') {
          try {
            syncedRemote = await pushSnapshot(local, localHash, metadata, remote?.revision ?? 0);
          } catch (error) {
            const latest = await fetchRemote();
            if (latest && latest.revision !== (remote?.revision ?? 0)) {
              set({ status: 'conflict', conflict: { local, localHash, remote: latest } });
              return;
            }
            throw error;
          }
        } else if (decision === 'pull' && remote) {
          await recallRepository.replaceSnapshot(remote.payload);
          await useRecallStore.getState().hydrate();
        }

        if (!syncedRemote) throw new Error('Cloud sync did not return a snapshot.');
        const nextMetadata = await saveSyncedMetadata(metadata, syncedRemote);
        set({ status: 'synced', conflict: null, lastSyncedAt: nextMetadata.lastSyncedAt, notice: 'Library synced.' });
      } catch (error) {
        set({ status: 'error', error: messageFrom(error) });
      }
    };
    activeSync = run().finally(() => { activeSync = null; });
    return activeSync;
  },

  resolveConflict: async (choice) => {
    const conflict = get().conflict;
    if (!conflict) return;
    set({ status: 'syncing', error: null, notice: null });
    try {
      const metadata = await ensureMetadata(get().session?.user.id);
      let selectedRemote = conflict.remote;
      if (choice === 'device') {
        selectedRemote = await pushSnapshot(conflict.local, conflict.localHash, metadata, conflict.remote.revision);
      } else {
        await recallRepository.replaceSnapshot(conflict.remote.payload);
        await useRecallStore.getState().hydrate();
      }
      const nextMetadata = await saveSyncedMetadata(metadata, selectedRemote);
      set({ status: 'synced', conflict: null, lastSyncedAt: nextMetadata.lastSyncedAt, notice: choice === 'device' ? 'This device is now the cloud copy.' : 'This device now matches the cloud copy.' });
    } catch (error) {
      set({ status: 'error', error: messageFrom(error) });
    }
  },

  dismissConflict: () => set({ conflict: null, status: 'idle', notice: 'Conflict left unresolved. Nothing was overwritten.' }),

  setAutoSync: async (enabled) => {
    const metadata = await ensureMetadata();
    await recallRepository.putSyncMetadata({ ...metadata, autoSync: enabled });
    set({ autoSync: enabled, notice: enabled ? 'Automatic sync is on.' : 'Automatic sync is off.' });
  },

  clearMessage: () => set({ error: null, notice: null })
}));
