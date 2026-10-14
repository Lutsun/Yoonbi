import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, Bus, GitBranch, MapPin, Users, Inbox, Siren, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from './auth/AuthProvider';
import { getStats, listReports } from './lib/api';

const LINKS = [
  { to: '/', label: 'Tableau de bord', end: true, icon: LayoutDashboard },
  { to: '/operateurs', label: 'Opérateurs', icon: Bus },
  { to: '/lignes', label: 'Lignes', icon: GitBranch },
  { to: '/arrets', label: 'Arrêts', icon: MapPin },
  { to: '/contributions', label: 'Contributions', icon: Inbox },
  { to: '/signalements', label: 'Signalements', icon: Siren },
  { to: '/utilisateurs', label: 'Utilisateurs', icon: Users },
];

export default function Layout() {
  const { email, signOut } = useAuth();
  const initial = email?.trim().charAt(0).toUpperCase() || '?';
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingReports, setPendingReports] = useState(0);
  // Sur téléphone, le menu latéral devient un tiroir qu'on ouvre d'un bouton.
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Sur téléphone, chaque ligne de tableau s'affiche en carte : chaque cellule
  // reprend le titre de sa colonne (data-label, lu par le CSS). Fait ici une
  // fois pour toutes les pages, plutôt que dans chaque tableau.
  useEffect(() => {
    const root = mainRef.current;
    if (!root) return;
    const label = () => {
      root.querySelectorAll('table').forEach((table) => {
        const heads = Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent?.trim() ?? '');
        table.querySelectorAll('tbody tr').forEach((row) => {
          Array.from(row.children).forEach((cell, i) => {
            if (heads[i] && cell.getAttribute('data-label') !== heads[i]) cell.setAttribute('data-label', heads[i]);
          });
        });
      });
    };
    label();
    const observer = new MutationObserver(label);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    getStats()
      .then((stats) => setPendingCount(stats.pending_submissions))
      .catch(() => {});
    listReports('pending')
      .then((reports) => setPendingReports(reports.length))
      .catch(() => {});
  }, []);

  return (
    <div className="app-shell">
      <header className="mobile-topbar">
        <button className="btn btn-icon" onClick={() => setMenuOpen(true)} aria-label="Ouvrir le menu">
          <Menu size={18} />
        </button>
        <span className="sidebar-brand-mark">Y</span>
        <span className="mobile-topbar-title">
          <span style={{ color: 'var(--yonn)' }}>Yoon</span>bi
        </span>
        {pendingCount + pendingReports > 0 && (
          <span className="sidebar-link-badge" style={{ marginLeft: 'auto' }}>
            {pendingCount + pendingReports}
          </span>
        )}
      </header>
      {menuOpen && <div className="sidebar-overlay" onClick={() => setMenuOpen(false)} />}
      <aside className={'sidebar' + (menuOpen ? ' open' : '')}>
        <button className="btn btn-icon sidebar-close" onClick={() => setMenuOpen(false)} aria-label="Fermer le menu">
          <X size={18} />
        </button>
        <div className="sidebar-brand">
          <span className="sidebar-brand-mark">Y</span>
          <span>
            <span style={{ color: 'var(--yonn)' }}>Yoon</span>bi
          </span>
        </div>
        <nav className="sidebar-nav">
          {LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) => 'sidebar-link' + (isActive ? ' active' : '')}
              >
                <Icon size={17} />
                {link.label}
                {link.to === '/contributions' && pendingCount > 0 && (
                  <span className="sidebar-link-badge">{pendingCount}</span>
                )}
                {link.to === '/signalements' && pendingReports > 0 && (
                  <span className="sidebar-link-badge">{pendingReports}</span>
                )}
              </NavLink>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          {email && (
            <div className="sidebar-account">
              <div className="sidebar-avatar">{initial}</div>
              <span className="sidebar-email" title={email}>
                {email}
              </span>
            </div>
          )}
          <button className="btn btn-block" onClick={() => signOut()}>
            <LogOut size={16} />
            Se déconnecter
          </button>
        </div>
      </aside>
      <main className="main" ref={mainRef}>
        <Outlet />
      </main>
    </div>
  );
}
