import { ArrowUpRight, Layers3, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getDueCards } from '../engine/learningEngine';
import type { Card, CardProgress, StudySet } from '../types';
import { MasteryBar } from './MasteryBar';

export function SetCard({ studySet, cards, progress }: {
  studySet: StudySet;
  cards: Card[];
  progress: Record<string, CardProgress>;
}) {
  // Unstudied cards count as 0, matching the set page and Progress page.
  const mastery = cards.length
    ? Math.round(cards.reduce((sum, card) => sum + (progress[card.id]?.mastery ?? 0), 0) / cards.length)
    : 0;
  const due = getDueCards(cards, progress).length;
  const starred = cards.filter((card) => card.starred).length;

  return (
    <Link to={`/sets/${studySet.id}`} className="set-card">
      <div className="set-card__topline">
        <span>{studySet.subject || 'Unfiled'}</span>
        <ArrowUpRight size={18} />
      </div>
      <h3>{studySet.title}</h3>
      <div className="set-card__stats">
        <span><Layers3 size={14} /> {cards.length} {cards.length === 1 ? 'card' : 'cards'}</span>
        {starred > 0 && <span><Star size={14} /> {starred}</span>}
        {due > 0 && <span className="set-card__due">{due} due</span>}
      </div>
      <MasteryBar value={mastery} compact />
    </Link>
  );
}
