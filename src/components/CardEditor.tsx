import { useState } from 'react';
import { X } from 'lucide-react';
import type { Card } from '../types';

export function CardEditor({ open, initial, onClose, onSave }: {
  open: boolean;
  initial?: Card | null;
  onClose: () => void;
  onSave: (values: { term: string; definition: string; starred: boolean }) => Promise<void>;
}) {
  if (!open) return null;
  return <CardEditorDialog initial={initial} onClose={onClose} onSave={onSave} />;
}

function CardEditorDialog({ initial, onClose, onSave }: {
  initial?: Card | null;
  onClose: () => void;
  onSave: (values: { term: string; definition: string; starred: boolean }) => Promise<void>;
}) {
  const [term, setTerm] = useState(initial?.term ?? '');
  const [definition, setDefinition] = useState(initial?.definition ?? '');
  const [starred, setStarred] = useState(initial?.starred ?? false);
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!term.trim() || !definition.trim() || saving) return;
    setSaving(true);
    try {
      await onSave({ term, definition, starred });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="card-editor-title">
        <div className="modal-card__header">
          <div>
            <p className="eyebrow">{initial ? 'Edit card' : 'New card'}</p>
            <h2 id="card-editor-title">{initial ? 'Tighten this memory' : 'Add one clear idea'}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
        <form onSubmit={submit} className="form-stack">
          <label>
            <span>Term</span>
            <textarea autoFocus value={term} onChange={(event) => setTerm(event.target.value)} rows={3} placeholder="The prompt or concept" required />
          </label>
          <label>
            <span>Definition</span>
            <textarea value={definition} onChange={(event) => setDefinition(event.target.value)} rows={4} placeholder="The answer you want to remember" required />
          </label>
          <label className="check-row">
            <input type="checkbox" checked={starred} onChange={(event) => setStarred(event.target.checked)} />
            <span>Mark as difficult</span>
          </label>
          <div className="modal-card__actions">
            <button type="button" className="button button--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="button button--primary" disabled={!term.trim() || !definition.trim() || saving}>
              {saving ? 'Saving…' : initial ? 'Save card' : 'Add card'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
