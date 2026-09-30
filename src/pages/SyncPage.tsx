import { useMemo, useState } from 'react';
import { AlertTriangle, Check, Cloud, Copy, KeyRound, LogOut, RefreshCw, ShieldCheck, Smartphone } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { useRecallStore } from '../store/useRecallStore';
import { useSyncStore } from '../store/useSyncStore';

function formatSyncTime(value: number | null): string {
  if (!value) return 'Not synced yet';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(value);
}

export function SyncPage() {
  const [key, setKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const sets = useRecallStore((state) => state.sets);
  const cards = useRecallStore((state) => state.cards);
  const sessions = useRecallStore((state) => state.sessions);
  const authReady = useSyncStore((state) => state.authReady);
  const connected = useSyncStore((state) => state.connected);
  const status = useSyncStore((state) => state.status);
  const autoSync = useSyncStore((state) => state.autoSync);
  const lastSyncedAt = useSyncStore((state) => state.lastSyncedAt);
  const conflict = useSyncStore((state) => state.conflict);
  const notice = useSyncStore((state) => state.notice);
  const error = useSyncStore((state) => state.error);
  const connect = useSyncStore((state) => state.connect);
  const disconnect = useSyncStore((state) => state.disconnect);
  const copyKey = useSyncStore((state) => state.copyKey);
  const syncNow = useSyncStore((state) => state.syncNow);
  const resolveConflict = useSyncStore((state) => state.resolveConflict);
  const dismissConflict = useSyncStore((state) => state.dismissConflict);
  const setAutoSync = useSyncStore((state) => state.setAutoSync);

  const localStats = useMemo(() => ({ sets: sets.length, cards: cards.length, sessions: sessions.length }), [sets, cards, sessions]);
  const cloudStats = conflict ? {
    sets: conflict.remote.payload.sets.length,
    cards: conflict.remote.payload.cards.length,
    sessions: conflict.remote.payload.sessions.length
  } : null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (key.trim().length < 32) return;
    setSubmitting(true);
    await connect(key);
    if (useSyncStore.getState().connected) setKey('');
    setSubmitting(false);
  }

  return (
    <div className="page sync-page">
      <PageHeader
        eyebrow="Your private cloud layer"
        title="Sync"
        description="Keep the same Recall library on your phone and desktop without giving up offline access."
      />

      {!authReady ? (
        <section className="sync-loading"><RefreshCw className="is-spinning" /><p>Opening private sync…</p></section>
      ) : !connected ? (
        <div className="sync-auth-layout">
          <section className="sync-promise">
            <div className="sync-promise__mark"><KeyRound /></div>
            <p className="eyebrow">One key · every device</p>
            <h2>Your library travels. Your offline copy stays.</h2>
            <ul>
              <li><ShieldCheck /><span><strong>Private by design</strong><small>Only devices with your personal key can open the cloud copy.</small></span></li>
              <li><Cloud /><span><strong>Local first</strong><small>Study, edit, and review without a connection.</small></span></li>
              <li><RefreshCw /><span><strong>You choose in a conflict</strong><small>Recall never silently picks one device over another.</small></span></li>
            </ul>
          </section>

          <form className="sync-auth-card" onSubmit={submit}>
            <div className="sync-key-badge"><KeyRound size={15} /> Personal sync</div>
            <div><p className="eyebrow">Connect this device</p><h2>Enter your private key.</h2></div>
            <p className="sync-auth-card__intro">Use the same key on the website and Android app. Your existing sets remain on this device when you connect or disconnect.</p>
            <label><span>Private sync key</span><input type="password" autoComplete="off" spellCheck={false} minLength={32} value={key} onChange={(event) => setKey(event.target.value)} placeholder="Paste your key" required /></label>
            <button className="button button--accent button--full" disabled={submitting || key.trim().length < 32}>{submitting ? 'Connecting…' : 'Connect and sync'}</button>
            <p className="sync-fine-print">Keep this key private. Recall stores it on this device, never in the public app code.</p>
          </form>
        </div>
      ) : (
        <>
          <section className="sync-status-card">
            <div className={`sync-status-card__signal sync-status-card__signal--${status}`}>
              {status === 'syncing' ? <RefreshCw className="is-spinning" /> : status === 'conflict' ? <AlertTriangle /> : <Cloud />}
            </div>
            <div className="sync-status-card__copy">
              <p className="eyebrow">{status === 'conflict' ? 'Choice required' : status === 'syncing' ? 'Syncing now' : 'Private sync connected'}</p>
              <h2>Your Recall library</h2>
              <p>{status === 'conflict' ? 'Both copies changed. Nothing will be overwritten until you choose.' : `Last sync: ${formatSyncTime(lastSyncedAt)}`}</p>
            </div>
            <button className="button button--accent" disabled={status === 'syncing' || status === 'conflict'} onClick={() => void syncNow()}><RefreshCw size={17} /> Sync now</button>
          </section>

          {conflict && cloudStats && (
            <section className="sync-conflict" aria-live="polite">
              <div className="sync-conflict__heading"><AlertTriangle /><div><p className="eyebrow">Sync paused safely</p><h2>Which library should win?</h2><p>Review the counts below. The other copy will be replaced only after you choose.</p></div></div>
              <div className="sync-conflict__choices">
                <article><Smartphone /><span><small>This device</small><strong>{localStats.sets} sets · {localStats.cards} cards</strong><em>{localStats.sessions} study sessions</em></span><button className="button button--primary" onClick={() => void resolveConflict('device')}>Keep this device</button></article>
                <article><Cloud /><span><small>Cloud copy</small><strong>{cloudStats.sets} sets · {cloudStats.cards} cards</strong><em>{cloudStats.sessions} study sessions</em></span><button className="button button--secondary" onClick={() => void resolveConflict('cloud')}>Use cloud copy</button></article>
              </div>
              <button className="text-link" onClick={dismissConflict}>Decide later — keep both unchanged</button>
            </section>
          )}

          <section className="sync-device-grid">
            <article><div><Smartphone /><span><small>On this device</small><strong>{localStats.sets} sets · {localStats.cards} cards</strong></span></div><Check /></article>
            <article><div><RefreshCw /><span><small>Automatic sync</small><strong>{autoSync ? 'On' : 'Off'}</strong></span></div><button className={`switch${autoSync ? ' is-on' : ''}`} role="switch" aria-checked={autoSync} onClick={() => void setAutoSync(!autoSync)}><span /></button></article>
            <article><div><ShieldCheck /><span><small>Offline access</small><strong>Always available</strong></span></div><Check /></article>
          </section>

          <div className="sync-key-actions">
            <button className="sync-signout" onClick={() => void copyKey()}><Copy size={17} /> Copy key for another device</button>
            <button className="sync-signout" disabled={status === 'syncing'} onClick={disconnect}><LogOut size={17} /> Disconnect this device</button>
          </div>
        </>
      )}

      {(notice || error) && <div className={`sync-message${error ? ' sync-message--error' : ''}`} role="status">{error ? <AlertTriangle /> : <Check />}{error ?? notice}</div>}
    </div>
  );
}
