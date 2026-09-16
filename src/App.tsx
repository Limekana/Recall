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
import { RapidFirePage } from './pages/RapidFirePage';
import { ProgressPage } from './pages/ProgressPage';

export default function App() {
  const ready = useRecallStore((state) => state.ready);
  const error = useRecallStore((state) => state.error);
  const hydrate = useRecallStore((state) => state.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (!ready) {
    return (
      <div className="launch-screen" aria-label="Opening Recall">
        <div className="brand-mark brand-mark--large" aria-hidden="true">R</div>
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
        <Route path="/rapid/:setId" element={<RapidFirePage />} />
        <Route path="/progress" element={<ProgressPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
