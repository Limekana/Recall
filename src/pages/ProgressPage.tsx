import { BarChart3, BrainCircuit, CalendarDays, CheckCircle2, Clock3, Flame, Layers3 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MasteryBar } from '../components/MasteryBar';
import { PageHeader } from '../components/PageHeader';
import { getDueCards } from '../engine/learningEngine';
import { formatRelativeDate } from '../lib/utils';
import { useRecallStore } from '../store/useRecallStore';

const modeNames = {
  flashcards: 'Flashcards',
  learn: 'Learn',
  review: 'Review',
  test: 'Test',
  match: 'Match',
  rapid: 'Rapid Fire'
};

export function ProgressPage() {
  const sets = useRecallStore((state) => state.sets);
  const cards = useRecallStore((state) => state.cards);
  const progress = useRecallStore((state) => state.progress);
  const sessions = useRecallStore((state) => state.sessions);
  const states = Object.values(progress);
  const studied = states.filter((item) => item.timesSeen > 0);
  const averageMastery = studied.length ? Math.round(studied.reduce((sum, item) => sum + item.mastery, 0) / studied.length) : 0;
  const due = getDueCards(cards, progress).length;
  const correct = states.reduce((sum, item) => sum + item.correctCount, 0);
  const answers = states.reduce((sum, item) => sum + item.timesSeen, 0);
  const accuracy = answers ? Math.round((correct / answers) * 100) : 0;
  const strong = states.filter((item) => item.mastery >= 85).length;
  const building = states.filter((item) => item.mastery >= 55 && item.mastery < 85).length;
  const learning = states.filter((item) => item.mastery > 0 && item.mastery < 55).length;
  const fresh = Math.max(0, cards.length - strong - building - learning);

  return (
    <div className="page progress-page">
      <PageHeader eyebrow="Your progress" title="Memory, made visible." description="Every score comes directly from your answers—nothing hidden, nothing guessed." />

      <section className="progress-overview">
        <div className="mastery-dial" style={{ '--mastery': `${averageMastery * 3.6}deg` } as React.CSSProperties}>
          <span><strong>{averageMastery}%</strong><small>overall mastery</small></span>
        </div>
        <div className="progress-metrics">
          <div><BrainCircuit /><span><strong>{studied.length}</strong><small>cards studied</small></span></div>
          <div><CheckCircle2 /><span><strong>{accuracy}%</strong><small>answer accuracy</small></span></div>
          <div><Clock3 /><span><strong>{due}</strong><small>due now</small></span></div>
          <div><CalendarDays /><span><strong>{sessions.length}</strong><small>sessions logged</small></span></div>
        </div>
      </section>

      <section className="mastery-breakdown">
        <div className="section-heading"><div><p className="eyebrow">Mastery map</p><h2>Where your cards stand</h2></div></div>
        <div className="distribution-bar" aria-label="Mastery distribution">
          {cards.length > 0 && <>
            <span className="is-strong" style={{ flex: strong }} /><span className="is-building" style={{ flex: building }} /><span className="is-learning" style={{ flex: learning }} /><span className="is-new" style={{ flex: fresh }} />
          </>}
        </div>
        <div className="distribution-legend">
          <span><i className="is-strong" /> Strong <strong>{strong}</strong></span>
          <span><i className="is-building" /> Building <strong>{building}</strong></span>
          <span><i className="is-learning" /> Learning <strong>{learning}</strong></span>
          <span><i className="is-new" /> New <strong>{fresh}</strong></span>
        </div>
      </section>

      <div className="progress-columns">
        <section className="set-progress-list">
          <div className="section-heading"><div><p className="eyebrow">By set</p><h2>Library strength</h2></div></div>
          {sets.filter((item) => !item.archived).map((studySet) => {
            const setCards = cards.filter((card) => card.setId === studySet.id);
            const mastery = setCards.length ? Math.round(setCards.reduce((sum, card) => sum + (progress[card.id]?.mastery ?? 0), 0) / setCards.length) : 0;
            return <Link to={`/sets/${studySet.id}`} key={studySet.id} className="set-progress-row"><div><Layers3 size={18} /><span><strong>{studySet.title}</strong><small>{setCards.length} cards</small></span></div><MasteryBar value={mastery} compact /></Link>;
          })}
          {!sets.length && <div className="empty-inline"><BarChart3 /><p>Your set progress will appear here.</p></div>}
        </section>

        <section className="session-history">
          <div className="section-heading"><div><p className="eyebrow">Recent activity</p><h2>Session history</h2></div></div>
          {sessions.slice().sort((a, b) => b.finishedAt - a.finishedAt).slice(0, 8).map((session) => {
            const studySet = sets.find((item) => item.id === session.setId);
            return <div className="session-row" key={session.id}><div className={`session-row__icon session-row__icon--${session.mode}`}>{session.mode === 'rapid' ? <Flame size={17} /> : <CheckCircle2 size={17} />}</div><div><strong>{modeNames[session.mode]}</strong><span>{studySet?.title ?? 'Mixed review'} · {formatRelativeDate(session.finishedAt)}</span></div><em>{session.mode === 'match' ? `${session.metadata?.seconds ?? '—'}s` : session.total ? `${Math.round((session.score / session.total) * 100)}%` : '—'}</em></div>;
          })}
          {!sessions.length && <div className="empty-inline"><CalendarDays /><p>Complete a study session to see it here.</p></div>}
        </section>
      </div>
    </div>
  );
}
