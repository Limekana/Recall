import type { Card, CardProgress, QuestionKind, TestQuestion } from '../types';
import { chooseQuestionKind } from './learningEngine';
import { getCardSide, seededNumber, seededShuffle } from '../lib/utils';

export function buildOptions(card: Card, cards: Card[], reverse: boolean, count = 4): string[] {
  const { answer } = getCardSide(card, reverse);
  const distractors = cards
    .filter((candidate) => candidate.id !== card.id)
    .map((candidate) => getCardSide(candidate, reverse).answer)
    .filter((value, index, list) => value !== answer && list.indexOf(value) === index);
  const selected = seededShuffle(distractors, `${card.id}:options`).slice(0, Math.max(0, count - 1));
  return seededShuffle([answer, ...selected], `${card.id}:answer-position`);
}

/**
 * Written questions run the opposite way to multiple choice: by default you see the definition
 * and type the term, because typing a whole definition word-for-word is rarely a fair test.
 * The reverse toggle flips both.
 */
export function writtenReverse(reverse: boolean): boolean {
  return !reverse;
}

export function buildLearnQuestion(
  card: Card,
  cards: Card[],
  progress: CardProgress,
  reverse: boolean
): TestQuestion {
  const kind = cards.length < 3 ? 'typed' : chooseQuestionKind(progress, card.id);
  const side = getCardSide(card, kind === 'typed' ? writtenReverse(reverse) : reverse);
  return {
    id: `${card.id}:${progress.timesSeen}`,
    cardId: card.id,
    kind,
    prompt: side.prompt,
    answer: side.answer,
    options: kind === 'choice' ? buildOptions(card, cards, reverse) : undefined
  };
}

export function buildTest(
  cards: Card[],
  amount: number,
  enabledKinds: QuestionKind[],
  reverse: boolean,
  seed = String(Date.now())
): TestQuestion[] {
  const pool = seededShuffle(cards, seed).slice(0, Math.min(amount, cards.length));
  return pool.map((card, index) => {
    let kind = enabledKinds[index % enabledKinds.length] ?? 'typed';
    if (kind === 'choice' && cards.length < 3) kind = 'typed';
    const side = getCardSide(card, kind === 'typed' ? writtenReverse(reverse) : reverse);
    if (kind === 'true-false') {
      const alternates = cards.filter((candidate) => getCardSide(candidate, reverse).answer !== side.answer);
      const alternate = alternates[seededNumber(`${seed}:${card.id}:alternate`) % Math.max(1, alternates.length)];
      // Without a genuinely different answer to show, the statement can only be true.
      const shouldBeTrue = !alternate || seededNumber(`${seed}:${card.id}`) % 2 === 0;
      return {
        id: `${seed}:${card.id}`,
        cardId: card.id,
        kind,
        prompt: side.prompt,
        answer: side.answer,
        shownStatement: shouldBeTrue || !alternate ? side.answer : getCardSide(alternate, reverse).answer,
        expectedBoolean: shouldBeTrue
      };
    }
    return {
      id: `${seed}:${card.id}`,
      cardId: card.id,
      kind,
      prompt: side.prompt,
      answer: side.answer,
      options: kind === 'choice' ? buildOptions(card, cards, reverse) : undefined
    };
  });
}
