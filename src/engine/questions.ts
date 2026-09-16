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

export function buildLearnQuestion(
  card: Card,
  cards: Card[],
  progress: CardProgress,
  reverse: boolean
): TestQuestion {
  const side = getCardSide(card, reverse);
  const kind = cards.length < 3 ? 'typed' : chooseQuestionKind(progress, card.id);
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
    const side = getCardSide(card, reverse);
    let kind = enabledKinds[index % enabledKinds.length] ?? 'typed';
    if (kind === 'choice' && cards.length < 3) kind = 'typed';
    if (kind === 'true-false') {
      const shouldBeTrue = seededNumber(`${seed}:${card.id}`) % 2 === 0;
      const alternate = cards.find((candidate) => candidate.id !== card.id) ?? card;
      return {
        id: `${seed}:${card.id}`,
        cardId: card.id,
        kind,
        prompt: side.prompt,
        answer: side.answer,
        shownStatement: shouldBeTrue ? side.answer : getCardSide(alternate, reverse).answer,
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
