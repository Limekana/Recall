import Dexie, { type EntityTable } from 'dexie';
import type { Card, CardProgress, RecallSnapshot, StudySession, StudySet, SyncMetadata, Tombstone } from '../types';
import { snapshotFingerprint } from '../sync/syncEngine';

class RecallDatabase extends Dexie {
  sets!: EntityTable<StudySet, 'id'>;
  cards!: EntityTable<Card, 'id'>;
  progress!: EntityTable<CardProgress, 'cardId'>;
  sessions!: EntityTable<StudySession, 'id'>;
  syncMeta!: EntityTable<SyncMetadata, 'id'>;
  tombstones!: EntityTable<Tombstone, 'id'>;

  constructor() {
    super('recall-local');
    this.version(1).stores({
      sets: 'id, title, subject, archived, updatedAt',
      cards: 'id, setId, starred, updatedAt',
      progress: 'cardId, mastery, nextReview',
      sessions: 'id, setId, mode, finishedAt'
    });
    this.version(2).stores({
      sets: 'id, title, subject, archived, updatedAt',
      cards: 'id, setId, starred, updatedAt',
      progress: 'cardId, mastery, nextReview',
      sessions: 'id, setId, mode, finishedAt',
      syncMeta: 'id'
    });
    this.version(3).stores({
      sets: 'id, title, subject, archived, updatedAt',
      cards: 'id, setId, starred, updatedAt',
      progress: 'cardId, mastery, nextReview',
      sessions: 'id, setId, mode, finishedAt',
      syncMeta: 'id',
      tombstones: 'id'
    });
  }
}

const db = new RecallDatabase();

export interface RecallRepository {
  loadAll(): Promise<{
    sets: StudySet[];
    cards: Card[];
    progress: CardProgress[];
    sessions: StudySession[];
  }>;
  putSet(set: StudySet): Promise<void>;
  putCards(cards: Card[]): Promise<void>;
  putProgress(progress: CardProgress): Promise<void>;
  putSession(session: StudySession): Promise<void>;
  deleteCard(cardId: string): Promise<void>;
  deleteSet(setId: string): Promise<void>;
  exportSnapshot(): Promise<RecallSnapshot>;
  replaceSnapshot(snapshot: RecallSnapshot): Promise<void>;
  /** Atomically replace the library only if it still matches `expectedFingerprint`. */
  replaceSnapshotIfUnchanged(expectedFingerprint: string, snapshot: RecallSnapshot): Promise<boolean>;
  loadSyncMetadata(): Promise<SyncMetadata | undefined>;
  putSyncMetadata(metadata: SyncMetadata): Promise<void>;
}

export class DexieRecallRepository implements RecallRepository {
  async loadAll() {
    const [sets, cards, progress, sessions] = await Promise.all([
      db.sets.toArray(),
      db.cards.toArray(),
      db.progress.toArray(),
      db.sessions.toArray()
    ]);
    return { sets, cards, progress, sessions };
  }

  async putSet(set: StudySet) {
    await db.sets.put(set);
  }

  async putCards(cards: Card[]) {
    await db.cards.bulkPut(cards);
  }

  async putProgress(progress: CardProgress) {
    await db.progress.put(progress);
  }

  async putSession(session: StudySession) {
    await db.sessions.put(session);
  }

  async deleteCard(cardId: string) {
    await db.transaction('rw', db.cards, db.progress, db.tombstones, async () => {
      await db.cards.delete(cardId);
      await db.progress.delete(cardId);
      await db.tombstones.put({ id: cardId, kind: 'card', deletedAt: Date.now() });
    });
  }

  async deleteSet(setId: string) {
    const cardIds = await db.cards.where('setId').equals(setId).primaryKeys();
    const deletedAt = Date.now();
    await db.transaction('rw', [db.sets, db.cards, db.progress, db.sessions, db.tombstones], async () => {
      await db.sets.delete(setId);
      await db.cards.where('setId').equals(setId).delete();
      await db.progress.bulkDelete(cardIds);
      await db.sessions.where('setId').equals(setId).delete();
      await db.tombstones.bulkPut([
        { id: setId, kind: 'set', deletedAt },
        ...cardIds.map((id) => ({ id, kind: 'card' as const, deletedAt }))
      ]);
    });
  }

  private async readSnapshot(): Promise<RecallSnapshot> {
    const [data, deleted] = await Promise.all([this.loadAll(), db.tombstones.toArray()]);
    return deleted.length ? { version: 1, ...data, deleted } : { version: 1, ...data };
  }

  async exportSnapshot(): Promise<RecallSnapshot> {
    return this.readSnapshot();
  }

  private async writeSnapshot(snapshot: RecallSnapshot) {
    await Promise.all([db.sets.clear(), db.cards.clear(), db.progress.clear(), db.sessions.clear(), db.tombstones.clear()]);
    if (snapshot.sets.length) await db.sets.bulkPut(snapshot.sets);
    if (snapshot.cards.length) await db.cards.bulkPut(snapshot.cards);
    if (snapshot.progress.length) await db.progress.bulkPut(snapshot.progress);
    if (snapshot.sessions.length) await db.sessions.bulkPut(snapshot.sessions);
    if (snapshot.deleted?.length) await db.tombstones.bulkPut(snapshot.deleted);
  }

  async replaceSnapshot(snapshot: RecallSnapshot) {
    await db.transaction('rw', [db.sets, db.cards, db.progress, db.sessions, db.tombstones], () => this.writeSnapshot(snapshot));
  }

  async replaceSnapshotIfUnchanged(expectedFingerprint: string, snapshot: RecallSnapshot) {
    return db.transaction('rw', [db.sets, db.cards, db.progress, db.sessions, db.tombstones], async () => {
      // Fingerprinting is synchronous, so the check and the write share one transaction.
      if (snapshotFingerprint(await this.readSnapshot()) !== expectedFingerprint) return false;
      await this.writeSnapshot(snapshot);
      return true;
    });
  }

  async loadSyncMetadata() {
    return db.syncMeta.get('primary');
  }

  async putSyncMetadata(metadata: SyncMetadata) {
    await db.syncMeta.put(metadata);
  }
}

export const recallRepository: RecallRepository = new DexieRecallRepository();
