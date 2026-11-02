import { describe, expect, it } from 'vitest';
import { hashSnapshot, mergeSnapshots } from './syncEngine';
import type { Card, CardProgress, RecallSnapshot, StudySession, StudySet } from '../types';

const set = (id: string, updatedAt = 1, title = id): StudySet => ({ id, title, subject: '', tags: [], archived: false, createdAt: 1, updatedAt });
const card = (id: string, setId: string, updatedAt = 1, term = id): Card => ({ id, setId, term, definition: `${id} def`, starred: false, createdAt: 1, updatedAt });
const progress = (cardId: string, lastSeen: number, timesSeen = 1): CardProgress => ({ cardId, mastery: 10 * timesSeen, timesSeen, correctCount: timesSeen, incorrectCount: 0, streak: 1, lastSeen, nextReview: 0 });
const session = (id: string, setId: string): StudySession => ({ id, setId, mode: 'learn', startedAt: 0, finishedAt: 1, score: 1, total: 1, weakCardIds: [] });
const snap = (parts: Partial<RecallSnapshot>): RecallSnapshot => ({ version: 1, sets: [], cards: [], progress: [], sessions: [], ...parts });

describe('mergeSnapshots', () => {
  it('combines cards added on each device', () => {
    const laptop = snap({ sets: [set('s')], cards: [card('a', 's'), card('laptop', 's', 5)] });
    const phone = snap({ sets: [set('s')], cards: [card('a', 's'), card('phone', 's', 6)] });
    expect(mergeSnapshots(phone, laptop).cards.map((item) => item.id).sort()).toEqual(['a', 'laptop', 'phone']);
  });

  it('keeps the newest edit of the same card', () => {
    const merged = mergeSnapshots(
      snap({ sets: [set('s')], cards: [card('a', 's', 2, 'old')] }),
      snap({ sets: [set('s')], cards: [card('a', 's', 9, 'new')] })
    );
    expect(merged.cards[0].term).toBe('new');
  });

  it('keeps the most recently studied progress and unions sessions', () => {
    const merged = mergeSnapshots(
      snap({ sets: [set('s')], cards: [card('a', 's')], progress: [progress('a', 100, 3)], sessions: [session('x', 's')] }),
      snap({ sets: [set('s')], cards: [card('a', 's')], progress: [progress('a', 200, 1)], sessions: [session('y', 's'), session('r', 'mixed-review')] })
    );
    expect(merged.progress[0].lastSeen).toBe(200);
    expect(merged.sessions.map((item) => item.id).sort()).toEqual(['r', 'x', 'y']);
  });

  it('propagates deletions instead of resurrecting them', () => {
    const merged = mergeSnapshots(
      snap({ sets: [set('s'), set('gone')], cards: [card('a', 's'), card('b', 'gone')], progress: [progress('a', 1), progress('b', 1)], sessions: [session('x', 'gone')] }),
      snap({ sets: [set('s')], cards: [], deleted: [{ id: 'gone', kind: 'set', deletedAt: 50 }, { id: 'b', kind: 'card', deletedAt: 50 }, { id: 'a', kind: 'card', deletedAt: 50 }] })
    );
    expect(merged.sets.map((item) => item.id)).toEqual(['s']);
    expect(merged.cards).toEqual([]);
    expect(merged.progress).toEqual([]);
    expect(merged.sessions).toEqual([]);
    expect(merged.deleted).toHaveLength(3);
  });

  it('keeps an item edited again after another device deleted it', () => {
    const merged = mergeSnapshots(
      snap({ sets: [set('s')], cards: [card('a', 's', 99)] }),
      snap({ sets: [set('s')], deleted: [{ id: 'a', kind: 'card', deletedAt: 50 }] })
    );
    expect(merged.cards.map((item) => item.id)).toEqual(['a']);
  });

  it('is order-independent and idempotent', async () => {
    const a = snap({ sets: [set('s', 3)], cards: [card('a', 's', 4)], progress: [progress('a', 10)] });
    const b = snap({ sets: [set('s', 5), set('t')], cards: [card('b', 't')], sessions: [session('x', 't')] });
    const ab = mergeSnapshots(a, b);
    expect(await hashSnapshot(ab)).toBe(await hashSnapshot(mergeSnapshots(b, a)));
    expect(await hashSnapshot(mergeSnapshots(ab, b))).toBe(await hashSnapshot(ab));
  });

  it('hashes old-format snapshots the same with or without an empty deleted list', async () => {
    const base = snap({ sets: [set('s')] });
    expect(await hashSnapshot(base)).toBe(await hashSnapshot({ ...base, deleted: [] }));
  });
});
