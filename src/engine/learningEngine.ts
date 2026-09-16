import type { AnswerEvent, Card, CardProgress, QuestionKind } from '../types';
import { clamp, seededNumber } from '../lib/utils';

export const EMPTY_PROGRESS = (cardId: string, now = Date.now()): CardProgress => ({
  cardId,
  mastery: 0,
  timesSeen: 0,
  correctCount: 0,
  incorrectCount: 0,
  streak: 0,
  lastSeen: null,
  nextReview: now
});

export function chooseQuestionKind(progress: CardProgress, cardId: string): QuestionKind {
  const roll = seededNumber(`${cardId}:${progress.timesSeen}`) % 100;
  if (progress.mastery < 35) return roll < 78 ? 'choice' : 'typed';
  if (progress.mastery < 72) return roll < 48 ? 'choice' : 'typed';
  return roll < 18 ? 'choice' : 'typed';
}

function reviewDelayMs(mastery: number, correct: boolean, kind: QuestionKind, streak: number): number {
  if (!correct) return mastery < 35 ? 5 * 60_000 : 15 * 60_000;
  const typedBonus = kind === 'typed' ? 1.35 : 1;
  const streakBonus = 1 + Math.min(streak, 5) * 0.08;
  const baseDays = mastery >= 90 ? 30 : mastery >= 75 ? 14 : mastery >= 55 ? 7 : mastery >= 35 ? 3 : 1;
  return Math.round(baseDays * typedBonus * streakBonus * 86_400_000);
}

export function applyAnswer(
  current: CardProgress | undefined,
  cardId: string,
  event: AnswerEvent
): CardProgress {
  const progress = current ?? EMPTY_PROGRESS(cardId, event.answeredAt);
  const nextStreak = event.correct ? progress.streak + 1 : 0;
  const recognitionGain = event.kind === 'choice' || event.kind === 'true-false' ? 8 : 14;
  const gain = recognitionGain + Math.min(nextStreak, 4);
  const penalty = event.kind === 'typed' ? 16 : 12;
  const mastery = clamp(progress.mastery + (event.correct ? gain : -penalty), 0, 100);

  return {
    ...progress,
    mastery,
    timesSeen: progress.timesSeen + 1,
    correctCount: progress.correctCount + (event.correct ? 1 : 0),
    incorrectCount: progress.incorrectCount + (event.correct ? 0 : 1),
    streak: nextStreak,
    lastSeen: event.answeredAt,
    nextReview: event.answeredAt + reviewDelayMs(mastery, event.correct, event.kind, nextStreak)
  };
}

export function getDueCards(cards: Card[], progress: Record<string, CardProgress>, now = Date.now()): Card[] {
  return cards.filter((card) => {
    const state = progress[card.id];
    return Boolean(state && state.timesSeen > 0 && state.nextReview <= now);
  });
}

export function masteryLabel(mastery: number): string {
  if (mastery >= 85) return 'Strong';
  if (mastery >= 55) return 'Building';
  if (mastery > 0) return 'Learning';
  return 'New';
}

export function masteryTone(mastery: number): 'strong' | 'building' | 'learning' | 'new' {
  if (mastery >= 85) return 'strong';
  if (mastery >= 55) return 'building';
  if (mastery > 0) return 'learning';
  return 'new';
}
