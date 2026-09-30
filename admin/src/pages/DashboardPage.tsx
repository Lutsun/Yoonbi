import { useEffect, useState } from 'react';
import {
  Bus,
  GitBranch,
  MapPin,
  Users,
  Bookmark,
  Star,
  AlertTriangle,
  TrendingUp,
  Inbox,
} from 'lucide-react';
import { getStats } from '../lib/api';
import type { Stats } from '../lib/types';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getStats()
      .then((s) => !cancelled && setStats(s))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <div className="notice notice-danger">{error}</div>;
  if (!stats) return <div className="centered-state">Chargement…</div>;

  const maxLines = Math.max(1, ...stats.lines_by_operator.map((o) => o.lines));

  return (
    <div>
      <PageHeader title="Tableau de bord" subtitle="Vue d'ensemble du réseau et de son utilisation." />

      <div className="stat-grid">
        <StatCard icon={<Bus size={19} />} label="Opérateurs" value={stats.operators} />
        <StatCard icon={<GitBranch size={19} />} label="Lignes" value={stats.lines} />
        <StatCard icon={<MapPin size={19} />} label="Arrêts" value={stats.stops} />
        <StatCard icon={<Users size={19} />} label="Comptes créés" value={stats.users} />
        <StatCard icon={<Bookmark size={19} />} label="Trajets enregistrés" value={stats.saved_trips} />
        <StatCard icon={<Star size={19} />} label="Lignes en favori" value={stats.favorite_lines} />
        <StatCard icon={<Inbox size={19} />} label="Contributions en attente" value={stats.pending_submissions} />
      </div>

      {(stats.orphan_stops > 0 || stats.short_lines > 0) && (
        <div className="notice notice-warning" style={{ marginBottom: 20, flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              {stats.orphan_stops > 0 && (
                <div>
                  {stats.orphan_stops} arrêt{stats.orphan_stops > 1 ? 's' : ''} sans aucune ligne —
                  invisible{stats.orphan_stops > 1 ? 's' : ''} pour le calcul d'itinéraire.
                </div>
              )}
              {stats.short_lines > 0 && (
                <div>
                  {stats.short_lines} ligne{stats.short_lines > 1 ? 's' : ''} avec moins de 2 arrêts —
                  inutilisable{stats.short_lines > 1 ? 's' : ''} par le calcul d'itinéraire.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="two-col">
        <div className="card">
          <h3>Lignes par opérateur</h3>
          {stats.lines_by_operator.length === 0 ? (
            <p className="page-subtitle">Aucune donnée.</p>
          ) : (
            stats.lines_by_operator.map((o) => (
              <div className="bar-row" key={o.operator}>
                <div className="bar-row-head">
                  <span>{o.operator}</span>
                  <span>{o.lines}</span>
                </div>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{ width: `${(o.lines / maxLines) * 100}%`, background: o.color }}
                  />
                </div>
              </div>
            ))
          )}
        </div>

        <div className="card">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrendingUp size={16} />
            Lignes les plus mises en favori
          </h3>
          {stats.popular_lines.length === 0 ? (
            <p className="page-subtitle">Aucun favori pour le moment.</p>
          ) : (
            <table>
              <tbody>
                {stats.popular_lines.map((l) => (
                  <tr key={l.code + l.operator}>
                    <td style={{ padding: '10px 0', border: 'none' }}>
                      <strong>{l.code}</strong> · {l.name}
                      <div style={{ color: 'var(--ink-faint)', fontSize: 12 }}>{l.operator}</div>
                    </td>
                    <td style={{ padding: '10px 0', border: 'none', textAlign: 'right', fontWeight: 700 }}>
                      {l.favorites}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
