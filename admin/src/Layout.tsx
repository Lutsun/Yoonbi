import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Bus, GitBranch, MapPin, Users, Inbox, Siren, LogOut } from 'lucide-react';
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
      <aside className="sidebar">
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
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
