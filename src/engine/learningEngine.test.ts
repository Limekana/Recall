import { describe, expect, it } from 'vitest';
import { applyAnswer, chooseQuestionKind, EMPTY_PROGRESS, getDueCards } from './learningEngine';
import type { Card, CardProgress } from '../types';

describe('learning engine', () => {
  it('awards more mastery for typed recall than recognition', () => {
    const initial = EMPTY_PROGRESS('card-1', 1_000);
    const choice = applyAnswer(initial, 'card-1', { correct: true, kind: 'choice', answeredAt: 2_000 });
    const typed = applyAnswer(initial, 'card-1', { correct: true, kind: 'typed', answeredAt: 2_000 });
    expect(typed.mastery).toBeGreaterThan(choice.mastery);
  });

  it('lowers mastery, clears streak, and returns a missed card sooner', () => {
    const initial: CardProgress = {
      cardId: 'card-1',
      mastery: 70,
      timesSeen: 8,
      correctCount: 7,
      incorrectCount: 1,
      streak: 5,
      lastSeen: 1_000,
      nextReview: 5_000
    };
    const result = applyAnswer(initial, 'card-1', { correct: false, kind: 'typed', answeredAt: 10_000 });
    expect(result.mastery).toBe(54);
    expect(result.streak).toBe(0);
    expect(result.nextReview).toBe(10_000 + 15 * 60_000);
  });

  it('keeps mastery inside the 0–100 range', () => {
    let state = EMPTY_PROGRESS('card-1', 0);
    for (let index = 0; index < 30; index += 1) {
      state = applyAnswer(state, 'card-1', { correct: true, kind: 'typed', answeredAt: index + 1 });
    }
    expect(state.mastery).toBe(100);
    state = applyAnswer(state, 'card-1', { correct: false, kind: 'typed', answeredAt: 50 });
    expect(state.mastery).toBeGreaterThanOrEqual(0);
  });

  it('chooses question type deterministically for identical state', () => {
    const state = EMPTY_PROGRESS('card-1');
    expect(chooseQuestionKind(state, 'card-1')).toBe(chooseQuestionKind(state, 'card-1'));
  });

  it('returns only previously studied cards whose review time has arrived', () => {
    const cards: Card[] = ['a', 'b', 'c'].map((id) => ({
      id,
      setId: 'set',
      term: id,
      definition: id,
      starred: false,
      createdAt: 0,
      updatedAt: 0
    }));
    const progress: Record<string, CardProgress> = {
      a: { ...EMPTY_PROGRESS('a'), timesSeen: 1, nextReview: 50 },
      b: { ...EMPTY_PROGRESS('b'), timesSeen: 1, nextReview: 150 },
      c: { ...EMPTY_PROGRESS('c'), timesSeen: 0, nextReview: 0 }
    };
    expect(getDueCards(cards, progress, 100).map((card) => card.id)).toEqual(['a']);
  });
});
