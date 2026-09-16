import { useMemo, useState } from 'react';
import { ArrowRight, BookOpenCheck, Plus, Sparkles } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { SetCard } from '../components/SetCard';
import { SetEditor } from '../components/SetEditor';
import { getDueCards } from '../engine/learningEngine';
import { useRecallStore } from '../store/useRecallStore';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function HomePage() {
  const navigate = useNavigate();
  const [editorOpen, setEditorOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const sets = useRecallStore((state) => state.sets);
  const cards = useRecallStore((state) => state.cards);
  const progress = useRecallStore((state) => state.progress);
  const sessions = useRecallStore((state) => state.sessions);
  const createSet = useRecallStore((state) => state.createSet);
  const createStarterSet = useRecallStore((state) => state.createStarterSet);
  const activeSets = sets.filter((item) => !item.archived).sort((a, b) => b.updatedAt - a.updatedAt);
  const dueCards = useMemo(() => getDueCards(cards, progress), [cards, progress]);
  const answered = Object.values(progress).reduce((sum, item) => sum + item.timesSeen, 0);
  const weekAgo = Date.now() - 7 * 86_400_000;
  const weekSessions = sessions.filter((session) => session.finishedAt >= weekAgo).length;

  async function addStarter() {
    if (starting) return;
    setStarting(true);
    const studySet = await createStarterSet();
    navigate(`/sets/${studySet.id}`);
  }

  return (
    <div className="page home-page">
      <header className="home-header">
        <div>
          <p className="eyebrow">{greeting()}</p>
          <h1>Make it stick.</h1>
        </div>
        <button className="button button--primary button--compact" onClick={() => setEditorOpen(true)}>
          <Plus size={18} /> New set
        </button>
      </header>

      {activeSets.length === 0 ? (
        <section className="first-run">
          <div className="first-run__orbit" aria-hidden="true"><span>R</span></div>
          <div>
            <p className="eyebrow">Your memory, under your control</p>
            <h2>Build a library that lives on this device.</h2>
            <p>Create cards by hand or paste straight from a spreadsheet. Recall adapts with clear rules—no account, no AI, no mystery.</p>
            <div className="button-row">
              <button className="button button--primary" onClick={() => setEditorOpen(true)}><Plus size={18} /> Create your first set</button>
              <button className="button button--secondary" onClick={() => void addStarter()} disabled={starting}>
                <Sparkles size={18} /> {starting ? 'Preparing…' : 'Try a starter set'}
              </button>
            </div>
          </div>
        </section>
      ) : (
        <>
          <section className="today-card">
            <div className="today-card__signal" aria-hidden="true">
              <span style={{ '--signal': `${Math.min(100, dueCards.length * 14 + 20)}%` } as React.CSSProperties} />
            </div>
            <div className="today-card__content">
              <p className="eyebrow">Today’s signal</p>
              <h2>{dueCards.length ? `${dueCards.length} ${dueCards.length === 1 ? 'memory is' : 'memories are'} ready.` : 'You’re caught up.'}</h2>
              <p>{dueCards.length ? 'A short review now keeps them from fading later.' : 'Start a Learn session or add a fresh set when you’re ready.'}</p>
            </div>
            {dueCards.length ? (
              <Link to="/review" className="button button--accent">Review now <ArrowRight size={18} /></Link>
            ) : (
              <Link to={`/sets/${activeSets[0].id}`} className="button button--accent">Open latest set <ArrowRight size={18} /></Link>
            )}
          </section>

          <section className="metric-strip" aria-label="Study overview">
            <div><strong>{activeSets.length}</strong><span>active sets</span></div>
            <div><strong>{cards.length}</strong><span>cards saved</span></div>
            <div><strong>{answered}</strong><span>answers logged</span></div>
            <div><strong>{weekSessions}</strong><span>sessions this week</span></div>
          </section>

          <section className="section-block">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Continue learning</p>
                <h2>Recent sets</h2>
              </div>
              <Link to="/library" className="text-link">View library <ArrowRight size={15} /></Link>
            </div>
            <div className="set-grid">
              {activeSets.slice(0, 3).map((studySet) => (
                <SetCard key={studySet.id} studySet={studySet} cards={cards.filter((card) => card.setId === studySet.id)} progress={progress} />
              ))}
            </div>
          </section>

          <aside className="offline-banner">
            <BookOpenCheck size={22} />
            <div><strong>Everything is stored locally.</strong><span>Close the app, go offline, come back later—your progress stays here.</span></div>
          </aside>
        </>
      )}

      <SetEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSave={async (values) => {
          const studySet = await createSet(values);
          navigate(`/sets/${studySet.id}`);
        }}
      />
    </div>
  );
}
