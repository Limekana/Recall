import { useMemo, useState } from 'react';
import { Archive, Plus, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { SetCard } from '../components/SetCard';
import { SetEditor } from '../components/SetEditor';
import { useRecallStore } from '../store/useRecallStore';

export function LibraryPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const sets = useRecallStore((state) => state.sets);
  const cards = useRecallStore((state) => state.cards);
  const progress = useRecallStore((state) => state.progress);
  const createSet = useRecallStore((state) => state.createSet);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return sets
      .filter((item) => item.archived === showArchived)
      .filter((item) => !needle || `${item.title} ${item.subject} ${item.tags.join(' ')}`.toLocaleLowerCase().includes(needle))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [query, sets, showArchived]);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Your library"
        title="Every set, within reach."
        description="Create from scratch or import a spreadsheet in seconds."
        action={<button className="button button--primary" onClick={() => setEditorOpen(true)}><Plus size={18} /> New set</button>}
      />

      <div className="library-toolbar">
        <label className="search-field">
          <Search size={19} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles, subjects, or tags" />
        </label>
        <button className={`filter-button${showArchived ? ' is-active' : ''}`} onClick={() => setShowArchived((value) => !value)}>
          <Archive size={18} /> {showArchived ? 'Showing archived' : 'Archived'}
        </button>
      </div>

      {filtered.length ? (
        <div className="set-grid set-grid--wide">
          {filtered.map((studySet) => (
            <SetCard key={studySet.id} studySet={studySet} cards={cards.filter((card) => card.setId === studySet.id)} progress={progress} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <Archive size={30} />
          <h2>{query ? 'No sets match that search.' : showArchived ? 'No archived sets.' : 'Your library is empty.'}</h2>
          <p>{query ? 'Try another title, subject, or tag.' : 'Create a set to start building durable memories.'}</p>
          {!query && !showArchived && <button className="button button--primary" onClick={() => setEditorOpen(true)}><Plus size={18} /> Create a set</button>}
        </div>
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
