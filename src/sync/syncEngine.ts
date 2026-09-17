import type { RecallSnapshot, SyncMetadata } from '../types';

export interface RemoteSnapshot {
  revision: number;
  payload: RecallSnapshot;
  payloadHash: string;
  deviceId: string;
  updatedAt: string;
}

export type SyncDecision = 'push' | 'pull' | 'conflict' | 'noop';

export function decideSync(input: {
  localHash: string;
  localHasData: boolean;
  metadata: SyncMetadata;
  remote: RemoteSnapshot | null;
}): SyncDecision {
  const { localHash, localHasData, metadata, remote } = input;
  if (!remote) return 'push';
  if (remote.payloadHash === localHash) return 'noop';

  if (metadata.lastSyncedRevision === 0) {
    return localHasData ? 'conflict' : 'pull';
  }

  const localChanged = localHash !== metadata.lastSyncedHash;
  const remoteChanged = remote.revision !== metadata.lastSyncedRevision;

  if (localChanged && remoteChanged) return 'conflict';
  if (remoteChanged) return 'pull';
  if (localChanged) return 'push';
  return 'noop';
}

function orderedSnapshot(snapshot: RecallSnapshot): RecallSnapshot {
  return {
    version: 1,
    sets: [...snapshot.sets].sort((a, b) => a.id.localeCompare(b.id)),
    cards: [...snapshot.cards].sort((a, b) => a.id.localeCompare(b.id)),
    progress: [...snapshot.progress].sort((a, b) => a.cardId.localeCompare(b.cardId)),
    sessions: [...snapshot.sessions].sort((a, b) => a.id.localeCompare(b.id))
  };
}

export async function hashSnapshot(snapshot: RecallSnapshot): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(orderedSnapshot(snapshot)));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function snapshotHasData(snapshot: RecallSnapshot): boolean {
  return snapshot.sets.length > 0 || snapshot.cards.length > 0 || snapshot.progress.length > 0 || snapshot.sessions.length > 0;
}

export function isRecallSnapshot(value: unknown): value is RecallSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<RecallSnapshot>;
  return snapshot.version === 1
    && Array.isArray(snapshot.sets)
    && Array.isArray(snapshot.cards)
    && Array.isArray(snapshot.progress)
    && Array.isArray(snapshot.sessions);
}
