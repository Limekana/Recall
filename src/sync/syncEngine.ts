import type { Card, CardProgress, RecallSnapshot, StudySession, StudySet, Tombstone } from '../types';

export interface RemoteSnapshot {
  revision: number;
  payload: RecallSnapshot;
  payloadHash: string;
  deviceId: string;
  updatedAt: string;
}

/** Canonical ordering shared by the client and the sync function, so both compute the same hash. */
export function orderedSnapshot(snapshot: RecallSnapshot): RecallSnapshot {
  const ordered: RecallSnapshot = {
    version: 1,
    sets: [...snapshot.sets].sort((a, b) => a.id.localeCompare(b.id)),
    cards: [...snapshot.cards].sort((a, b) => a.id.localeCompare(b.id)),
    progress: [...snapshot.progress].sort((a, b) => a.cardId.localeCompare(b.cardId)),
    sessions: [...snapshot.sessions].sort((a, b) => a.id.localeCompare(b.id))
  };
  // Only include tombstones when present so hashes of older-format snapshots don't change.
  if (snapshot.deleted?.length) ordered.deleted = [...snapshot.deleted].sort((a, b) => a.id.localeCompare(b.id));
  return ordered;
}

export function snapshotFingerprint(snapshot: RecallSnapshot): string {
  return JSON.stringify(orderedSnapshot(snapshot));
}

export async function hashSnapshot(snapshot: RecallSnapshot): Promise<string> {
  const bytes = new TextEncoder().encode(snapshotFingerprint(snapshot));
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
    && Array.isArray(snapshot.sessions)
    && (snapshot.deleted === undefined || Array.isArray(snapshot.deleted));
}

function unionBy<T>(local: T[], remote: T[], key: (item: T) => string, prefer: (a: T, b: T) => T): Map<string, T> {
  const merged = new Map<string, T>();
  for (const item of [...local, ...remote]) {
    const id = key(item);
    const existing = merged.get(id);
    merged.set(id, existing ? prefer(existing, item) : item);
  }
  return merged;
}

const newerEdit = <T extends { updatedAt: number }>(a: T, b: T) => (b.updatedAt > a.updatedAt ? b : a);

/** The progress record reflecting the most recent study wins; more answers breaks ties. */
function newerProgress(a: CardProgress, b: CardProgress): CardProgress {
  const aSeen = a.lastSeen ?? 0;
  const bSeen = b.lastSeen ?? 0;
  if (bSeen !== aSeen) return bSeen > aSeen ? b : a;
  return b.timesSeen > a.timesSeen ? b : a;
}

/**
 * Record-level merge of two libraries. Edits: newest `updatedAt` wins per set/card. Progress:
 * most recently studied wins per card. Sessions: union. Deletions: a tombstone removes the item
 * unless it was edited again after being deleted. `local` wins exact ties.
 */
export function mergeSnapshots(local: RecallSnapshot, remote: RecallSnapshot): RecallSnapshot {
  const tombstones = unionBy<Tombstone>(local.deleted ?? [], remote.deleted ?? [], (item) => item.id,
    (a, b) => (b.deletedAt > a.deletedAt ? b : a));
  const deletedAt = (id: string) => tombstones.get(id)?.deletedAt ?? -Infinity;

  const sets = [...unionBy<StudySet>(local.sets, remote.sets, (item) => item.id, newerEdit).values()]
    .filter((set) => set.updatedAt > deletedAt(set.id));
  const setIds = new Set(sets.map((set) => set.id));

  const cards = [...unionBy<Card>(local.cards, remote.cards, (item) => item.id, newerEdit).values()]
    .filter((card) => setIds.has(card.setId) && card.updatedAt > deletedAt(card.id));
  const cardIds = new Set(cards.map((card) => card.id));

  const progress = [...unionBy<CardProgress>(local.progress, remote.progress, (item) => item.cardId, newerProgress).values()]
    .filter((item) => cardIds.has(item.cardId));

  const sessions = [...unionBy<StudySession>(local.sessions, remote.sessions, (item) => item.id, (a) => a).values()]
    .filter((session) => setIds.has(session.setId) || !Number.isFinite(deletedAt(session.setId)));

  const merged: RecallSnapshot = { version: 1, sets, cards, progress, sessions };
  if (tombstones.size) merged.deleted = [...tombstones.values()];
  return merged;
}
