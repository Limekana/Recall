import { useState } from 'react';
import { X } from 'lucide-react';
import type { StudySet } from '../types';

interface SetEditorProps {
  open: boolean;
  initial?: StudySet | null;
  onClose: () => void;
  onSave: (values: { title: string; subject: string; tags: string[] }) => Promise<void>;
}

export function SetEditor({ open, initial, onClose, onSave }: SetEditorProps) {
  if (!open) return null;
  return <SetEditorDialog initial={initial} onClose={onClose} onSave={onSave} />;
}

function SetEditorDialog({ initial, onClose, onSave }: Omit<SetEditorProps, 'open'>) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [tags, setTags] = useState(initial?.tags.join(', ') ?? '');
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      await onSave({
        title,
        subject,
        tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean)
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="set-editor-title">
        <div className="modal-card__header">
          <div>
            <p className="eyebrow">{initial ? 'Edit set' : 'New set'}</p>
            <h2 id="set-editor-title">{initial ? 'Refine the details' : 'What are you learning?'}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
        <form onSubmit={submit} className="form-stack">
          <label>
            <span>Title</span>
            <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Swedish — Jakso 2" required />
          </label>
          <label>
            <span>Subject or folder <em>optional</em></span>
            <input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Languages" />
          </label>
          <label>
            <span>Tags <em>comma separated</em></span>
            <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="vocabulary, exam" />
          </label>
          <div className="modal-card__actions">
            <button type="button" className="button button--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="button button--primary" disabled={!title.trim() || saving}>
              {saving ? 'Saving…' : initial ? 'Save changes' : 'Create set'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
