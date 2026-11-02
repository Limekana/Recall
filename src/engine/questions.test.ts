import { describe, expect, it } from 'vitest';
import { EMPTY_PROGRESS, orderForLearning } from './learningEngine';
import { buildLearnQuestion, buildTest } from './questions';
import type { Card } from '../types';

const card = (id: string, term: string, definition: string, starred = false): Card => ({
  id, setId: 's', term, definition, starred, createdAt: 0, updatedAt: 0
});
const cards = [card('a', 'hej', 'hello'), card('b', 'tack', 'thank you'), card('c', 'katt', 'cat')];

describe('question direction', () => {
  it('asks written questions for the term and choice questions for the definition', () => {
    // Fewer than three cards forces written questions.
    const written = buildLearnQuestion(cards[0], cards.slice(0, 2), EMPTY_PROGRESS('a'), false);
    expect(written.kind).toBe('typed');
    expect(written.prompt).toBe('hello');
    expect(written.answer).toBe('hej');

    const test = buildTest(cards, 3, ['choice'], false, 'seed');
    expect(test.every((question) => question.answer === cards.find((item) => item.id === question.cardId)!.definition)).toBe(true);
  });

  it('flips both directions with reverse', () => {
    const written = buildLearnQuestion(cards[0], cards.slice(0, 2), EMPTY_PROGRESS('a'), true);
    expect(written.prompt).toBe('hej');
    expect(written.answer).toBe('hello');
  });

  it('never shows a true statement as the false option', () => {
    const duplicates = [card('a', 'one', 'same'), card('b', 'two', 'same'), card('c', 'three', 'other')];
    for (let seed = 0; seed < 30; seed += 1) {
      for (const question of buildTest(duplicates, 3, ['true-false'], false, String(seed))) {
        const isTrue = question.shownStatement === question.answer;
        expect(isTrue).toBe(question.expectedBoolean);
      }
    }
  });
});

describe('learn order', () => {
  it('puts new, weak and difficult cards first, keeping set order on ties', () => {
    const set = [card('a', 'a', 'a'), card('b', 'b', 'b'), card('c', 'c', 'c', true), card('d', 'd', 'd')];
    const progress = {
      a: { ...EMPTY_PROGRESS('a'), mastery: 80 },
      b: { ...EMPTY_PROGRESS('b'), mastery: 20 },
      c: { ...EMPTY_PROGRESS('c'), mastery: 20 }
    };
    expect(orderForLearning(set, progress).map((item) => item.id)).toEqual(['d', 'c', 'b', 'a']);
  });
});
