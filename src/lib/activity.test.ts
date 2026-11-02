import { describe, expect, it } from 'vitest';
import { sortByRecentActivity } from './activity';
import type { Card, StudySet } from '../types';

const set = (id: string, updatedAt: number): StudySet => ({ id, title: id, subject: '', tags: [], archived: false, createdAt: 0, updatedAt });
const card = (id: string, setId: string): Card => ({ id, setId, term: id, definition: id, starred: false, createdAt: 0, updatedAt: 0 });

describe('recent set ordering', () => {
  it('ranks a recently studied set above a recently edited one', () => {
    const sets = [set('edited', 500), set('studied', 100)];
    const cards = [card('c1', 'studied')];
    const progress = { c1: { cardId: 'c1', mastery: 10, timesSeen: 1, correctCount: 1, incorrectCount: 0, streak: 1, lastSeen: 900, nextReview: 0 } };
    expect(sortByRecentActivity(sets, cards, progress, []).map((item) => item.id)).toEqual(['studied', 'edited']);
  });

  it('counts game and test sessions', () => {
    const sets = [set('a', 500), set('b', 100)];
    const sessions = [{ id: 's', setId: 'b', mode: 'match' as const, startedAt: 0, finishedAt: 1000, score: 1, total: 1, weakCardIds: [] }];
    expect(sortByRecentActivity(sets, [], {}, sessions).map((item) => item.id)).toEqual(['b', 'a']);
  });
});
