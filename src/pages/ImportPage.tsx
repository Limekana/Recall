import { useMemo, useState } from 'react';
import { AlertCircle, ArrowLeft, Check, ClipboardPaste, Import } from 'lucide-react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { parseImportText } from '../lib/utils';
import { useRecallStore } from '../store/useRecallStore';

export function ImportPage() {
  const { setId = '' } = useParams();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [termColumn, setTermColumn] = useState(0);
  const [definitionColumn, setDefinitionColumn] = useState(1);
  const [importing, setImporting] = useState(false);
  const studySet = useRecallStore((state) => state.sets.find((item) => item.id === setId));
  const importCards = useRecallStore((state) => state.importCards);
  const rows = useMemo(() => parseImportText(text), [text]);
  const columnCount = Math.max(2, ...rows.map((row) => row.cells.length));
  const evaluated = rows.map((row) => ({
    ...row,
    term: row.cells[termColumn]?.trim() ?? '',
    definition: row.cells[definitionColumn]?.trim() ?? '',
    validSelection: termColumn !== definitionColumn && Boolean(row.cells[termColumn]?.trim()) && Boolean(row.cells[definitionColumn]?.trim())
  }));
  const validRows = evaluated.filter((row) => row.validSelection);
  const invalidRows = evaluated.filter((row) => !row.validSelection);

  if (!studySet) return <Navigate to="/library" replace />;

  async function completeImport() {
    if (!validRows.length || importing) return;
    setImporting(true);
    try {
      await importCards(setId, validRows.map((row) => ({ term: row.term, definition: row.definition })));
      navigate(`/sets/${setId}`);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="page import-page">
      <Link to={`/sets/${setId}`} className="back-link"><ArrowLeft size={17} /> {studySet.title}</Link>
      <header className="import-header">
        <div>
          <p className="eyebrow">Fast import</p>
          <h1>Paste. Preview. Learn.</h1>
          <p>Copy rows from Excel, Sheets, or a vocabulary export. Tabs, commas, and semicolons are detected automatically.</p>
        </div>
        <div className="import-header__glyph" aria-hidden="true"><ClipboardPaste /></div>
      </header>

      <section className="import-workspace">
        <div className="paste-panel">
          <div className="panel-heading">
            <span className="step-number">1</span>
            <div><h2>Paste your rows</h2><p>One card per row works best.</p></div>
          </div>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={'hej\thello\ntack\tthank you\nhej då\tgoodbye'}
            spellCheck={false}
            aria-label="Paste terms and definitions"
          />
          <p className="paste-hint"><span>Tip</span> For newline pairs, put the term on one line and definition on the next.</p>
        </div>

        <div className="preview-panel">
          <div className="panel-heading">
            <span className="step-number">2</span>
            <div><h2>Map your columns</h2><p>Recall never guesses past this preview.</p></div>
          </div>

          <div className="column-mapping">
            <label><span>Term column</span><select value={termColumn} onChange={(event) => setTermColumn(Number(event.target.value))}>{Array.from({ length: columnCount }, (_, index) => <option key={index} value={index}>Column {index + 1}</option>)}</select></label>
            <span className="mapping-arrow">→</span>
            <label><span>Definition column</span><select value={definitionColumn} onChange={(event) => setDefinitionColumn(Number(event.target.value))}>{Array.from({ length: columnCount }, (_, index) => <option key={index} value={index}>Column {index + 1}</option>)}</select></label>
          </div>

          {!text.trim() ? (
            <div className="preview-empty"><Import size={27} /><p>Your preview will appear here.</p></div>
          ) : (
            <>
              <div className="preview-summary">
                <span className="success-text"><Check size={16} /> {validRows.length} ready</span>
                {invalidRows.length > 0 && <span className="error-text"><AlertCircle size={16} /> {invalidRows.length} rejected</span>}
              </div>
              {termColumn === definitionColumn && <div className="inline-alert"><AlertCircle size={18} /> Choose two different columns.</div>}
              <div className="import-table" role="table" aria-label="Import preview">
                <div className="import-table__header" role="row"><span>#</span><span>Term</span><span>Definition</span><span>Status</span></div>
                {evaluated.slice(0, 50).map((row) => (
                  <div key={row.index} className={`import-table__row${row.validSelection ? '' : ' is-invalid'}`} role="row">
                    <span>{row.index}</span>
                    <strong>{row.term || '—'}</strong>
                    <span>{row.definition || '—'}</span>
                    <span>{row.validSelection ? <Check size={16} /> : <AlertCircle size={16} />}</span>
                  </div>
                ))}
              </div>
              {evaluated.length > 50 && <p className="table-note">Showing the first 50 of {evaluated.length} rows.</p>}
            </>
          )}

          <div className="import-actions">
            <Link to={`/sets/${setId}`} className="button button--ghost">Cancel</Link>
            <button className="button button--primary" disabled={!validRows.length || termColumn === definitionColumn || importing} onClick={() => void completeImport()}>
              <Import size={18} /> {importing ? 'Importing…' : `Import ${validRows.length || ''} ${validRows.length === 1 ? 'card' : 'cards'}`}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
