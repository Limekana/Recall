import { masteryLabel, masteryTone } from '../engine/learningEngine';

export function MasteryBar({ value, compact = false }: { value: number; compact?: boolean }) {
  return (
    <div className={`mastery${compact ? ' mastery--compact' : ''}`}>
      <div className="mastery__meta">
        <span>{masteryLabel(value)}</span>
        <span>{Math.round(value)}%</span>
      </div>
      <div className="mastery__track" aria-label={`${Math.round(value)} percent mastery`}>
        <span className={`mastery__fill mastery__fill--${masteryTone(value)}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
