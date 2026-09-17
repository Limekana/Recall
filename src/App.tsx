import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { useRecallStore } from './store/useRecallStore';
import { HomePage } from './pages/HomePage';
import { LibraryPage } from './pages/LibraryPage';
import { SetDetailPage } from './pages/SetDetailPage';
import { ImportPage } from './pages/ImportPage';
import { StudyPage } from './pages/StudyPage';
import { ReviewPage } from './pages/ReviewPage';
import { TestPage } from './pages/TestPage';
import { MatchPage } from './pages/MatchPage';
import { BlockBlastPage } from './pages/BlockBlastPage';
import { ProgressPage } from './pages/ProgressPage';
import { SyncPage } from './pages/SyncPage';
import { RecallMark } from './components/RecallMark';
import { useSyncStore } from './store/useSyncStore';

export default function App() {
  const ready = useRecallStore((state) => state.ready);
  const error = useRecallStore((state) => state.error);
  const hydrate = useRecallStore((state) => state.hydrate);
  const initializeSync = useSyncStore((state) => state.initialize);
  const session = useSyncStore((state) => state.session);
  const autoSync = useSyncStore((state) => state.autoSync);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (ready) void initializeSync();
  }, [initializeSync, ready]);

  useEffect(() => {
    if (!ready || !session || !autoSync) return;
    let timer: number | undefined;
    const requestSync = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void useSyncStore.getState().syncNow(), 1400);
    };
    const unsubscribe = useRecallStore.subscribe((state, previous) => {
      if (state.sets !== previous.sets || state.cards !== previous.cards || state.progress !== previous.progress || state.sessions !== previous.sessions) requestSync();
    });
    const onVisible = () => { if (document.visibilityState === 'visible') requestSync(); };
    window.addEventListener('online', requestSync);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
      window.removeEventListener('online', requestSync);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [autoSync, ready, session]);

  if (!ready) {
    return (
      <div className="launch-screen" aria-label="Opening Recall">
        <div className="brand-mark brand-mark--large"><RecallMark /></div>
        <p>Gathering your memories…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fatal-state">
        <p className="eyebrow">Local storage unavailable</p>
        <h1>Recall could not open your library.</h1>
        <p>{error}</p>
        <button className="button button--primary" onClick={() => window.location.reload()}>Try again</button>
      </div>
    );
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/sets/:setId" element={<SetDetailPage />} />
        <Route path="/sets/:setId/import" element={<ImportPage />} />
        <Route path="/study/:setId/:mode" element={<StudyPage />} />
        <Route path="/review" element={<ReviewPage />} />
        <Route path="/test/:setId" element={<TestPage />} />
        <Route path="/match/:setId" element={<MatchPage />} />
        <Route path="/blast/:setId" element={<BlockBlastPage />} />
        <Route path="/progress" element={<ProgressPage />} />
        <Route path="/sync" element={<SyncPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
