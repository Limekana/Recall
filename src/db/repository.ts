import Dexie, { type EntityTable } from 'dexie';
import type { Card, CardProgress, StudySession, StudySet } from '../types';

class RecallDatabase extends Dexie {
  sets!: EntityTable<StudySet, 'id'>;
  cards!: EntityTable<Card, 'id'>;
  progress!: EntityTable<CardProgress, 'cardId'>;
  sessions!: EntityTable<StudySession, 'id'>;

  constructor() {
    super('recall-local');
    this.version(1).stores({
      sets: 'id, title, subject, archived, updatedAt',
      cards: 'id, setId, starred, updatedAt',
      progress: 'cardId, mastery, nextReview',
      sessions: 'id, setId, mode, finishedAt'
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
    await db.transaction('rw', db.cards, db.progress, async () => {
      await db.cards.delete(cardId);
      await db.progress.delete(cardId);
    });
  }

  async deleteSet(setId: string) {
    const cardIds = await db.cards.where('setId').equals(setId).primaryKeys();
    await db.transaction('rw', db.sets, db.cards, db.progress, db.sessions, async () => {
      await db.sets.delete(setId);
      await db.cards.where('setId').equals(setId).delete();
      await db.progress.bulkDelete(cardIds);
      await db.sessions.where('setId').equals(setId).delete();
    });
  }
}

export const recallRepository: RecallRepository = new DexieRecallRepository();
