import type { Card, CardProgress, StudySession, StudySet } from '../types';

/**
 * Last time each set was touched: edited, or studied in any mode. Answers in mixed Review
 * sessions count through each card's lastSeen, so they surface the right set too.
 */
export function lastActivityBySet(
  sets: StudySet[],
  cards: Card[],
  progress: Record<string, CardProgress>,
  sessions: StudySession[]
): Map<string, number> {
  const activity = new Map(sets.map((set) => [set.id, set.updatedAt]));
  const bump = (setId: string, at: number | null | undefined) => {
    const current = activity.get(setId);
    if (current !== undefined && at && at > current) activity.set(setId, at);
  };
  cards.forEach((card) => bump(card.setId, Math.max(card.updatedAt, progress[card.id]?.lastSeen ?? 0)));
  sessions.forEach((session) => bump(session.setId, session.finishedAt));
  return activity;
}

export function sortByRecentActivity(
  sets: StudySet[],
  cards: Card[],
  progress: Record<string, CardProgress>,
  sessions: StudySession[]
): StudySet[] {
  const activity = lastActivityBySet(sets, cards, progress, sessions);
  return [...sets].sort((a, b) => (activity.get(b.id) ?? 0) - (activity.get(a.id) ?? 0));
}
