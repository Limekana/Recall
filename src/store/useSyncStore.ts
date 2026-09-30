import { create } from 'zustand';
import { recallRepository } from '../db/repository';
import { clearSyncKey, fetchRemote, pushSnapshot, savedSyncKey, saveSyncKey } from '../sync/privateSync';
import { decideSync, hashSnapshot, snapshotHasData, type RemoteSnapshot } from '../sync/syncEngine';
import type { RecallSnapshot, SyncMetadata } from '../types';
import { useRecallStore } from './useRecallStore';

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'conflict' | 'error';

interface SyncConflict {
  local: RecallSnapshot;
  localHash: string;
  remote: RemoteSnapshot;
}

interface SyncState {
  connected: boolean;
  authReady: boolean;
  status: SyncStatus;
  autoSync: boolean;
  lastSyncedAt: number | null;
  conflict: SyncConflict | null;
  notice: string | null;
  error: string | null;
  initialize: () => Promise<void>;
  connect: (key: string) => Promise<void>;
  disconnect: () => void;
  copyKey: () => Promise<void>;
  syncNow: () => Promise<void>;
  resolveConflict: (choice: 'device' | 'cloud') => Promise<void>;
  dismissConflict: () => void;
  setAutoSync: (enabled: boolean) => Promise<void>;
  clearMessage: () => void;
}

let initialized = false;
let activeSync: Promise<void> | null = null;
let activeKey: string | null = null;

function deviceLabel(): string {
  const platform = navigator.userAgent.includes('Android') ? 'Android phone' : navigator.platform || 'Web device';
  return `${platform} · ${navigator.userAgent.includes('wv') ? 'Recall app' : 'Web'}`;
}

async function keyIdentity(key: string): Promise<string> {
  const bytes = new TextEncoder().encode(key);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function ensureMetadata(userId?: string): Promise<SyncMetadata> {
  const existing = await recallRepository.loadSyncMetadata();
  if (existing) {
    if (!userId || existing.userId === userId) return existing;
    const reset: SyncMetadata = {
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
  return error instanceof Error ? error.message : 'Sync could not finish. Your local library is safe.';
}

export const useSyncStore = create<SyncState>((set, get) => ({
  connected: false,
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
    activeKey = savedSyncKey();
    set({
      authReady: true,
      connected: Boolean(activeKey),
      autoSync: metadata.autoSync,
      lastSyncedAt: metadata.lastSyncedAt
    });
    if (activeKey && metadata.autoSync) void get().syncNow();
  },

  connect: async (key) => {
    const candidate = key.trim();
    if (candidate.length < 32) {
      set({ error: 'Enter the full private sync key.', notice: null });
      return;
    }
    set({ error: null, notice: null, status: 'syncing' });
    try {
      await fetchRemote(candidate);
      await ensureMetadata(await keyIdentity(candidate));
      saveSyncKey(candidate);
      activeKey = candidate;
      set({ connected: true, status: 'idle', lastSyncedAt: null });
      await get().syncNow();
    } catch (error) {
      set({ status: 'error', error: messageFrom(error) });
    }
  },

  disconnect: () => {
    clearSyncKey();
    activeKey = null;
    set({ connected: false, status: 'idle', conflict: null, notice: 'Private sync disconnected. Local study data remains here.', error: null });
  },

  copyKey: async () => {
    if (!activeKey) return;
    try {
      await navigator.clipboard.writeText(activeKey);
      set({ notice: 'Sync key copied. Keep it private.', error: null });
    } catch {
      set({ error: 'Could not copy the key. Check clipboard permissions.', notice: null });
    }
  },

  syncNow: async () => {
    if (activeSync) return activeSync;
    const key = activeKey;
    if (!key) return;
    const run = async () => {
      set({ status: 'syncing', error: null, notice: null });
      try {
        const [local, metadata, remote] = await Promise.all([
          recallRepository.exportSnapshot(),
          ensureMetadata(await keyIdentity(key)),
          fetchRemote(key)
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
            syncedRemote = await pushSnapshot(key, local, localHash, metadata.deviceId, remote?.revision ?? 0);
          } catch (error) {
            const latest = await fetchRemote(key);
            if (latest && latest.revision !== (remote?.revision ?? 0)) {
              set({ status: 'conflict', conflict: { local, localHash, remote: latest } });
              return;
            }
            throw error;
          }
        } else if (decision === 'pull' && remote) {
          const currentLocal = await recallRepository.exportSnapshot();
          const currentHash = await hashSnapshot(currentLocal);
          if (currentHash !== localHash) {
            set({ status: 'conflict', conflict: { local: currentLocal, localHash: currentHash, remote } });
            return;
          }
          await recallRepository.replaceSnapshot(remote.payload);
          await useRecallStore.getState().hydrate();
        }

        if (!syncedRemote) throw new Error('Private sync did not return a snapshot.');
        const nextMetadata = await saveSyncedMetadata(metadata, syncedRemote);
        set({ status: 'synced', conflict: null, lastSyncedAt: nextMetadata.lastSyncedAt, notice: 'Library synced.' });
        if (get().autoSync && activeKey === key) {
          const latestLocalHash = await hashSnapshot(await recallRepository.exportSnapshot());
          if (latestLocalHash !== syncedRemote.payloadHash) {
            window.setTimeout(() => void get().syncNow(), 0);
          }
        }
      } catch (error) {
        const message = messageFrom(error);
        if (message.includes('sync key was not accepted')) {
          clearSyncKey();
          activeKey = null;
          set({ connected: false });
        }
        set({ status: 'error', error: message });
      }
    };
    activeSync = run().finally(() => { activeSync = null; });
    return activeSync;
  },

  resolveConflict: async (choice) => {
    const conflict = get().conflict;
    const key = activeKey;
    if (!conflict || !key) return;
    set({ status: 'syncing', error: null, notice: null });
    try {
      const metadata = await ensureMetadata(await keyIdentity(key));
      const currentLocal = await recallRepository.exportSnapshot();
      const currentHash = await hashSnapshot(currentLocal);
      const latest = await fetchRemote(key);
      if (!latest) throw new Error('The cloud copy is missing. Sync again before choosing.');
      if (currentHash !== conflict.localHash || latest.revision !== conflict.remote.revision) {
        set({
          status: 'conflict',
          conflict: { local: currentLocal, localHash: currentHash, remote: latest },
          notice: 'A copy changed while you were deciding. Review the current versions again.'
        });
        return;
      }
      let selectedRemote = latest;
      if (choice === 'device') {
        selectedRemote = await pushSnapshot(key, currentLocal, currentHash, metadata.deviceId, latest.revision);
      } else {
        await recallRepository.replaceSnapshot(latest.payload);
        await useRecallStore.getState().hydrate();
      }
      const nextMetadata = await saveSyncedMetadata(metadata, selectedRemote);
      set({
        status: 'synced', conflict: null, lastSyncedAt: nextMetadata.lastSyncedAt,
        notice: choice === 'device' ? 'This device is now the cloud copy.' : 'This device now matches the cloud copy.'
      });
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
