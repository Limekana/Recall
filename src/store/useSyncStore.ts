import { create } from 'zustand';
import { recallRepository } from '../db/repository';
import { clearSyncKey, fetchRemote, pushSnapshot, savedSyncKey, saveSyncKey, SyncRevisionConflict } from '../sync/privateSync';
import { hashSnapshot, mergeSnapshots, snapshotFingerprint, type RemoteSnapshot } from '../sync/syncEngine';
import type { SyncMetadata } from '../types';
import { useRecallStore } from './useRecallStore';

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

/** How many times to re-read and re-merge when another device writes mid-sync. */
const MAX_SYNC_ATTEMPTS = 4;

interface SyncState {
  connected: boolean;
  authReady: boolean;
  status: SyncStatus;
  autoSync: boolean;
  lastSyncedAt: number | null;
  notice: string | null;
  error: string | null;
  initialize: () => Promise<void>;
  connect: (key: string) => Promise<void>;
  disconnect: () => void;
  copyKey: () => Promise<void>;
  syncNow: () => Promise<void>;
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
    set({ connected: false, status: 'idle', notice: 'Private sync disconnected. Local study data remains here.', error: null });
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
    if (activeSync) {
      // Changes made during a sync are picked up by the follow-up check at the end of it.
      return activeSync;
    }
    const key = activeKey;
    if (!key) return;
    const run = async () => {
      set({ status: 'syncing', error: null, notice: null });
      try {
        const metadata = await ensureMetadata(await keyIdentity(key));
        for (let attempt = 0; attempt < MAX_SYNC_ATTEMPTS; attempt += 1) {
          const [local, remote] = await Promise.all([recallRepository.exportSnapshot(), fetchRemote(key)]);
          const localFingerprint = snapshotFingerprint(local);
          const localHash = await hashSnapshot(local);

          // Merge record-by-record instead of making one device's library win.
          const merged = remote && remote.payloadHash !== localHash ? mergeSnapshots(local, remote.payload) : local;
          const mergedHash = merged === local ? localHash : await hashSnapshot(merged);

          if (mergedHash !== localHash) {
            const applied = await recallRepository.replaceSnapshotIfUnchanged(localFingerprint, merged);
            if (!applied) continue; // Studied while merging: start over with the newer local copy.
            await useRecallStore.getState().hydrate();
          }

          let synced: RemoteSnapshot | null = remote;
          if (!remote || remote.payloadHash !== mergedHash) {
            try {
              synced = await pushSnapshot(key, merged, mergedHash, metadata.deviceId, remote?.revision ?? 0);
            } catch (error) {
              if (error instanceof SyncRevisionConflict) continue; // Another device pushed first.
              throw error;
            }
          }
          if (!synced) throw new Error('Private sync did not return a snapshot.');

          const nextMetadata = await saveSyncedMetadata(metadata, synced);
          set({ status: 'synced', lastSyncedAt: nextMetadata.lastSyncedAt, notice: 'Library synced.' });
          if (get().autoSync && activeKey === key) {
            const latestLocalHash = await hashSnapshot(await recallRepository.exportSnapshot());
            if (latestLocalHash !== synced.payloadHash) window.setTimeout(() => void get().syncNow(), 0);
          }
          return;
        }
        throw new Error('Another device kept changing the library. Sync will retry shortly.');
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

  setAutoSync: async (enabled) => {
    const metadata = await ensureMetadata();
    await recallRepository.putSyncMetadata({ ...metadata, autoSync: enabled });
    set({ autoSync: enabled, notice: enabled ? 'Automatic sync is on.' : 'Automatic sync is off.' });
  },

  clearMessage: () => set({ error: null, notice: null })
}));
