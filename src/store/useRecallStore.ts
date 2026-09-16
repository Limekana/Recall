import { create } from 'zustand';
import { applyAnswer } from '../engine/learningEngine';
import { makeId } from '../lib/utils';
import { recallRepository } from '../db/repository';
import type { AnswerEvent, Card, CardProgress, StudySession, StudySet } from '../types';

interface SetInput {
  title: string;
  subject?: string;
  tags?: string[];
}

interface CardInput {
  term: string;
  definition: string;
  starred?: boolean;
}

interface RecallState {
  sets: StudySet[];
  cards: Card[];
  progress: Record<string, CardProgress>;
  sessions: StudySession[];
  ready: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  createSet: (input: SetInput) => Promise<StudySet>;
  createStarterSet: () => Promise<StudySet>;
  updateSet: (setId: string, input: SetInput) => Promise<void>;
  duplicateSet: (setId: string) => Promise<StudySet | null>;
  toggleArchiveSet: (setId: string) => Promise<void>;
  deleteSet: (setId: string) => Promise<void>;
  addCard: (setId: string, input: CardInput) => Promise<Card>;
  importCards: (setId: string, inputs: CardInput[]) => Promise<Card[]>;
  updateCard: (cardId: string, input: CardInput) => Promise<void>;
  toggleStar: (cardId: string) => Promise<void>;
  deleteCard: (cardId: string) => Promise<void>;
  answerCard: (cardId: string, event: AnswerEvent) => Promise<CardProgress>;
  recordSession: (session: Omit<StudySession, 'id'>) => Promise<StudySession>;
}

function cardsFromInputs(setId: string, inputs: CardInput[], now = Date.now()): Card[] {
  return inputs.map((input, index) => ({
    id: makeId('card'),
    setId,
    term: input.term.trim(),
    definition: input.definition.trim(),
    starred: input.starred ?? false,
    createdAt: now + index,
    updatedAt: now + index
  }));
}

export const useRecallStore = create<RecallState>((set, get) => ({
  sets: [],
  cards: [],
  progress: {},
  sessions: [],
  ready: false,
  error: null,

  hydrate: async () => {
    try {
      const data = await recallRepository.loadAll();
      const progress = Object.fromEntries(data.progress.map((item) => [item.cardId, item]));
      set({ ...data, progress, ready: true, error: null });
    } catch (error) {
      set({ ready: true, error: error instanceof Error ? error.message : 'Could not open local storage.' });
    }
  },

  createSet: async (input) => {
    const now = Date.now();
    const studySet: StudySet = {
      id: makeId('set'),
      title: input.title.trim(),
      subject: input.subject?.trim() ?? '',
      tags: input.tags?.map((tag) => tag.trim()).filter(Boolean) ?? [],
      archived: false,
      createdAt: now,
      updatedAt: now
    };
    await recallRepository.putSet(studySet);
    set((state) => ({ sets: [studySet, ...state.sets] }));
    return studySet;
  },

  createStarterSet: async () => {
    const studySet = await get().createSet({
      title: 'How Recall works',
      subject: 'Starter set',
      tags: ['welcome']
    });
    const starterCards: CardInput[] = [
      { term: 'Active recall', definition: 'Retrieving information from memory instead of rereading it.' },
      { term: 'Spaced review', definition: 'Revisiting material after increasing intervals.' },
      { term: 'Typed answer', definition: 'A harder recall format that strengthens mastery more than recognition.' },
      { term: 'Still learning', definition: 'Marks a card to return sooner without hiding the mistake.' },
      { term: 'Review', definition: 'A focused session containing cards whose next review time has arrived.' },
      { term: 'Local-first', definition: 'Your sets and progress work on this device without an account or internet.' }
    ];
    await get().importCards(studySet.id, starterCards);
    return studySet;
  },

  updateSet: async (setId, input) => {
    const existing = get().sets.find((item) => item.id === setId);
    if (!existing) return;
    const updated: StudySet = {
      ...existing,
      title: input.title.trim(),
      subject: input.subject?.trim() ?? '',
      tags: input.tags?.map((tag) => tag.trim()).filter(Boolean) ?? [],
      updatedAt: Date.now()
    };
    await recallRepository.putSet(updated);
    set((state) => ({ sets: state.sets.map((item) => (item.id === setId ? updated : item)) }));
  },

  duplicateSet: async (setId) => {
    const source = get().sets.find((item) => item.id === setId);
    if (!source) return null;
    const duplicate = await get().createSet({
      title: `${source.title} — copy`,
      subject: source.subject,
      tags: source.tags
    });
    const sourceCards = get().cards.filter((card) => card.setId === setId);
    await get().importCards(
      duplicate.id,
      sourceCards.map(({ term, definition, starred }) => ({ term, definition, starred }))
    );
    return duplicate;
  },

  toggleArchiveSet: async (setId) => {
    const existing = get().sets.find((item) => item.id === setId);
    if (!existing) return;
    const updated = { ...existing, archived: !existing.archived, updatedAt: Date.now() };
    await recallRepository.putSet(updated);
    set((state) => ({ sets: state.sets.map((item) => (item.id === setId ? updated : item)) }));
  },

  deleteSet: async (setId) => {
    await recallRepository.deleteSet(setId);
    set((state) => {
      const deletedCardIds = new Set(state.cards.filter((card) => card.setId === setId).map((card) => card.id));
      return {
        sets: state.sets.filter((item) => item.id !== setId),
        cards: state.cards.filter((card) => card.setId !== setId),
        progress: Object.fromEntries(
          Object.entries(state.progress).filter(([cardId]) => !deletedCardIds.has(cardId))
        ),
        sessions: state.sessions.filter((session) => session.setId !== setId)
      };
    });
  },

  addCard: async (setId, input) => {
    const card = cardsFromInputs(setId, [input])[0];
    await recallRepository.putCards([card]);
    set((state) => ({ cards: [...state.cards, card] }));
    return card;
  },

  importCards: async (setId, inputs) => {
    const cards = cardsFromInputs(setId, inputs);
    if (!cards.length) return [];
    await recallRepository.putCards(cards);
    set((state) => ({ cards: [...state.cards, ...cards] }));
    return cards;
  },

  updateCard: async (cardId, input) => {
    const existing = get().cards.find((item) => item.id === cardId);
    if (!existing) return;
    const updated: Card = {
      ...existing,
      term: input.term.trim(),
      definition: input.definition.trim(),
      starred: input.starred ?? existing.starred,
      updatedAt: Date.now()
    };
    await recallRepository.putCards([updated]);
    set((state) => ({ cards: state.cards.map((item) => (item.id === cardId ? updated : item)) }));
  },

  toggleStar: async (cardId) => {
    const existing = get().cards.find((item) => item.id === cardId);
    if (!existing) return;
    await get().updateCard(cardId, { ...existing, starred: !existing.starred });
  },

  deleteCard: async (cardId) => {
    await recallRepository.deleteCard(cardId);
    set((state) => {
      const progress = { ...state.progress };
      delete progress[cardId];
      return { cards: state.cards.filter((item) => item.id !== cardId), progress };
    });
  },

  answerCard: async (cardId, event) => {
    const updated = applyAnswer(get().progress[cardId], cardId, event);
    await recallRepository.putProgress(updated);
    set((state) => ({ progress: { ...state.progress, [cardId]: updated } }));
    return updated;
  },

  recordSession: async (input) => {
    const session: StudySession = { ...input, id: makeId('session') };
    await recallRepository.putSession(session);
    set((state) => ({ sessions: [session, ...state.sessions] }));
    return session;
  }
}));
