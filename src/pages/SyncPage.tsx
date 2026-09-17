import { useMemo, useState } from 'react';
import { AlertTriangle, Check, Cloud, CloudOff, Laptop, LogOut, RefreshCw, ShieldCheck, Smartphone } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { useRecallStore } from '../store/useRecallStore';
import { useSyncStore } from '../store/useSyncStore';

function formatSyncTime(value: number | null): string {
  if (!value) return 'Not synced yet';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(value);
}

export function SyncPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const sets = useRecallStore((state) => state.sets);
  const cards = useRecallStore((state) => state.cards);
  const sessions = useRecallStore((state) => state.sessions);
  const configured = useSyncStore((state) => state.configured);
  const authReady = useSyncStore((state) => state.authReady);
  const session = useSyncStore((state) => state.session);
  const status = useSyncStore((state) => state.status);
  const autoSync = useSyncStore((state) => state.autoSync);
  const lastSyncedAt = useSyncStore((state) => state.lastSyncedAt);
  const conflict = useSyncStore((state) => state.conflict);
  const notice = useSyncStore((state) => state.notice);
  const error = useSyncStore((state) => state.error);
  const signIn = useSyncStore((state) => state.signIn);
  const signUp = useSyncStore((state) => state.signUp);
  const signOut = useSyncStore((state) => state.signOut);
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
    if (!email.trim() || password.length < 8) return;
    setSubmitting(true);
    await (mode === 'signin' ? signIn(email, password) : signUp(email, password));
    setSubmitting(false);
  }

  return (
    <div className="page sync-page">
      <PageHeader
        eyebrow="Optional cloud layer"
        title="Sync"
        description="Keep the same Recall library on your phone and desktop without giving up offline access."
      />

      {!configured ? (
        <section className="sync-unavailable">
          <CloudOff />
          <div><p className="eyebrow">Local mode</p><h2>Cloud sync is not configured in this build.</h2><p>Your library is still fully available offline on this device.</p></div>
        </section>
      ) : !authReady ? (
        <section className="sync-loading"><RefreshCw className="is-spinning" /><p>Checking your sync account…</p></section>
      ) : !session ? (
        <div className="sync-auth-layout">
          <section className="sync-promise">
            <div className="sync-promise__mark"><Cloud /></div>
            <p className="eyebrow">Local first, cloud when you want it</p>
            <h2>Your library can travel. The app never depends on it.</h2>
            <ul>
              <li><ShieldCheck /><span><strong>Offline stays complete</strong><small>Study, edit, and review without a connection.</small></span></li>
              <li><RefreshCw /><span><strong>Conflicts stop for you</strong><small>Recall never silently chooses one device over another.</small></span></li>
              <li><Laptop /><span><strong>One private account</strong><small>Use the same email on Android and the web.</small></span></li>
            </ul>
          </section>

          <form className="sync-auth-card" onSubmit={submit}>
            <div className="sync-auth-tabs" role="tablist">
              <button type="button" className={mode === 'signin' ? 'is-active' : ''} onClick={() => setMode('signin')}>Sign in</button>
              <button type="button" className={mode === 'signup' ? 'is-active' : ''} onClick={() => setMode('signup')}>Create account</button>
            </div>
            <div><p className="eyebrow">{mode === 'signin' ? 'Welcome back' : 'Start syncing'}</p><h2>{mode === 'signin' ? 'Open your cloud copy.' : 'Make sync optional.'}</h2></div>
            <label><span>Email</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            <label><span>Password</span><input type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
            <button className="button button--accent button--full" disabled={submitting}>{submitting ? 'One moment…' : mode === 'signin' ? 'Sign in and sync' : 'Create sync account'}</button>
            <p className="sync-fine-print">No subscription, analytics, or public profile. Signing out never removes local study data.</p>
          </form>
        </div>
      ) : (
        <>
          <section className="sync-status-card">
            <div className={`sync-status-card__signal sync-status-card__signal--${status}`}>
              {status === 'syncing' ? <RefreshCw className="is-spinning" /> : status === 'conflict' ? <AlertTriangle /> : <Cloud />}
            </div>
            <div className="sync-status-card__copy">
              <p className="eyebrow">{status === 'conflict' ? 'Choice required' : status === 'syncing' ? 'Syncing now' : 'Connected'}</p>
              <h2>{session.user.email}</h2>
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

          <button className="sync-signout" onClick={() => void signOut()}><LogOut size={17} /> Sign out of sync</button>
        </>
      )}

      {(notice || error) && <div className={`sync-message${error ? ' sync-message--error' : ''}`} role="status">{error ? <AlertTriangle /> : <Check />}{error ?? notice}</div>}
    </div>
  );
}
