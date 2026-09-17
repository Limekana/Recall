import { useEffect, type ReactNode } from 'react';
import { BarChart3, Cloud, Home, Layers3, RefreshCw } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { RecallMark } from './RecallMark';

const navigation = [
  { to: '/', label: 'Today', icon: Home, end: true },
  { to: '/library', label: 'Library', icon: Layers3 },
  { to: '/review', label: 'Review', icon: RefreshCw },
  { to: '/progress', label: 'Progress', icon: BarChart3 },
  { to: '/sync', label: 'Sync', icon: Cloud }
];

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const focusMode = /\/(study|test|match|blast)\//.test(pathname);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname]);

  return (
    <div className={`app-shell${focusMode ? ' app-shell--focus' : ''}`}>
      <aside className="side-rail" aria-label="Main navigation">
        <NavLink to="/" className="wordmark" aria-label="Recall home">
          <span className="brand-mark"><RecallMark /></span>
          <span>Recall</span>
        </NavLink>
        <nav>
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}>
              <Icon size={19} strokeWidth={1.8} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <p className="local-note"><span /> Local first</p>
      </aside>

      <main className="app-content">{children}</main>

      <nav className="bottom-nav" aria-label="Main navigation">
        {navigation.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `bottom-nav__link${isActive ? ' is-active' : ''}`}>
            <Icon size={21} strokeWidth={1.8} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
