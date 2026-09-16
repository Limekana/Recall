import { useMemo, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  BrainCircuit,
  BookOpen,
  ChevronRight,
  ClipboardCheck,
  Copy,
  Edit3,
  Flame,
  Gamepad2,
  Import,
  MoreHorizontal,
  Plus,
  Search,
  Star,
  Trash2
} from 'lucide-react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { CardEditor } from '../components/CardEditor';
import { MasteryBar } from '../components/MasteryBar';
import { SetEditor } from '../components/SetEditor';
import { useRecallStore } from '../store/useRecallStore';
import type { Card } from '../types';

const studyModes = [
  { key: 'flashcards', title: 'Flashcards', description: 'Flip through at your own pace', icon: BookOpen, path: 'study' },
  { key: 'learn', title: 'Learn', description: 'Adaptive questions that grow with you', icon: BrainCircuit, path: 'study' },
  { key: 'test', title: 'Test', description: 'Check what you can recall unaided', icon: ClipboardCheck, path: 'test' },
  { key: 'match', title: 'Match', description: 'Pair terms against the clock', icon: Gamepad2, path: 'match' },
  { key: 'rapid', title: 'Rapid Fire', description: 'Build a streak under pressure', icon: Flame, path: 'rapid' }
] as const;

export function SetDetailPage() {
  const { setId = '' } = useParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [setEditorOpen, setSetEditorOpen] = useState(false);
  const [cardEditorOpen, setCardEditorOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const sets = useRecallStore((state) => state.sets);
  const allCards = useRecallStore((state) => state.cards);
  const progress = useRecallStore((state) => state.progress);
  const updateSet = useRecallStore((state) => state.updateSet);
  const duplicateSet = useRecallStore((state) => state.duplicateSet);
  const toggleArchiveSet = useRecallStore((state) => state.toggleArchiveSet);
  const deleteSet = useRecallStore((state) => state.deleteSet);
  const addCard = useRecallStore((state) => state.addCard);
  const updateCard = useRecallStore((state) => state.updateCard);
  const toggleStar = useRecallStore((state) => state.toggleStar);
  const deleteCard = useRecallStore((state) => state.deleteCard);
  const studySet = sets.find((item) => item.id === setId);
  const cards = allCards.filter((card) => card.setId === setId);
  const visibleCards = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return cards.filter((card) => !needle || `${card.term} ${card.definition}`.toLocaleLowerCase().includes(needle));
  }, [cards, query]);
  const averageMastery = cards.length
    ? Math.round(cards.reduce((sum, card) => sum + (progress[card.id]?.mastery ?? 0), 0) / cards.length)
    : 0;

  if (!studySet) return <Navigate to="/library" replace />;

  async function removeSet() {
    if (!window.confirm(`Delete “${studySet?.title}” and all of its cards? This cannot be undone.`)) return;
    await deleteSet(setId);
    navigate('/library');
  }

  function openEditCard(card: Card) {
    setEditingCard(card);
    setCardEditorOpen(true);
  }

  return (
    <div className="page set-page">
      <Link to="/library" className="back-link"><ArrowLeft size={17} /> Library</Link>

      <section className="set-hero">
        <div className="set-hero__main">
          <div className="set-hero__label">
            <span>{studySet.subject || 'Unfiled'}</span>
            {studySet.archived && <span className="status-pill">Archived</span>}
          </div>
          <h1>{studySet.title}</h1>
          {studySet.tags.length > 0 && <div className="tag-row">{studySet.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>}
        </div>
        <div className="menu-wrap">
          <button className="icon-button icon-button--bordered" aria-label="Set options" onClick={() => setMenuOpen((value) => !value)}><MoreHorizontal /></button>
          {menuOpen && (
            <div className="context-menu">
              <button onClick={() => { setSetEditorOpen(true); setMenuOpen(false); }}><Edit3 size={16} /> Edit details</button>
              <button onClick={async () => { const copy = await duplicateSet(setId); if (copy) navigate(`/sets/${copy.id}`); }}><Copy size={16} /> Duplicate</button>
              <button onClick={() => void toggleArchiveSet(setId)}><Archive size={16} /> {studySet.archived ? 'Unarchive' : 'Archive'}</button>
              <button className="danger" onClick={() => void removeSet()}><Trash2 size={16} /> Delete set</button>
            </div>
          )}
        </div>
        <div className="set-hero__metrics">
          <div><strong>{cards.length}</strong><span>cards</span></div>
          <div><strong>{cards.filter((card) => card.starred).length}</strong><span>difficult</span></div>
          <div className="set-hero__mastery"><MasteryBar value={averageMastery} /></div>
        </div>
      </section>

      {cards.length > 0 && (
        <section className="mode-grid" aria-label="Study modes">
          {studyModes.map(({ key, title, description, icon: Icon, path }, index) => {
            const to = path === 'study' ? `/study/${setId}/${key}` : `/${path}/${setId}`;
            return (
              <Link key={key} to={to} className={`mode-card${index === 1 ? ' mode-card--featured' : ''}`}>
                <Icon size={22} />
                <div><h3>{title}</h3><p>{description}</p></div>
                <ChevronRight size={19} />
              </Link>
            );
          })}
        </section>
      )}

      <section className="section-block card-library">
        <div className="section-heading section-heading--wrap">
          <div>
            <p className="eyebrow">Card library</p>
            <h2>{cards.length ? `${cards.length} ${cards.length === 1 ? 'memory' : 'memories'}` : 'Add your first cards'}</h2>
          </div>
          <div className="button-row">
            <Link to={`/sets/${setId}/import`} className="button button--secondary"><Import size={18} /> Import</Link>
            <button className="button button--primary" onClick={() => { setEditingCard(null); setCardEditorOpen(true); }}><Plus size={18} /> Add card</button>
          </div>
        </div>

        {cards.length > 4 && (
          <label className="search-field search-field--cards"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a card" /></label>
        )}

        {cards.length === 0 ? (
          <div className="empty-state empty-state--compact">
            <BookOpen size={29} />
            <h3>Start with one clear prompt.</h3>
            <p>Add cards individually, or paste rows from Excel, Sheets, or another vocabulary app.</p>
            <div className="button-row">
              <button className="button button--primary" onClick={() => setCardEditorOpen(true)}><Plus size={18} /> Add a card</button>
              <Link to={`/sets/${setId}/import`} className="button button--secondary"><Import size={18} /> Paste a list</Link>
            </div>
          </div>
        ) : (
          <div className="card-list">
            {visibleCards.map((card, index) => (
              <article key={card.id} className="card-row">
                <span className="card-row__number">{String(index + 1).padStart(2, '0')}</span>
                <button className={`star-button${card.starred ? ' is-starred' : ''}`} onClick={() => void toggleStar(card.id)} aria-label={card.starred ? 'Unmark difficult' : 'Mark difficult'}>
                  <Star size={18} fill={card.starred ? 'currentColor' : 'none'} />
                </button>
                <button className="card-row__content" onClick={() => openEditCard(card)}>
                  <strong>{card.term}</strong><span>{card.definition}</span>
                </button>
                <div className="card-row__mastery"><MasteryBar value={progress[card.id]?.mastery ?? 0} compact /></div>
                <button className="icon-button" onClick={() => openEditCard(card)} aria-label="Edit card"><Edit3 size={17} /></button>
                <button className="icon-button icon-button--danger" onClick={() => { if (window.confirm('Delete this card?')) void deleteCard(card.id); }} aria-label="Delete card"><Trash2 size={17} /></button>
              </article>
            ))}
          </div>
        )}
      </section>

      <SetEditor
        open={setEditorOpen}
        initial={studySet}
        onClose={() => setSetEditorOpen(false)}
        onSave={(values) => updateSet(setId, values)}
      />
      <CardEditor
        open={cardEditorOpen}
        initial={editingCard}
        onClose={() => { setCardEditorOpen(false); setEditingCard(null); }}
        onSave={async (values) => {
          if (editingCard) await updateCard(editingCard.id, values);
          else await addCard(setId, values);
        }}
      />
    </div>
  );
}
