import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Siren } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import { listReports } from '../lib/api';
import { REPORT_STATUS_LABEL, REPORT_TYPE_LABEL } from '../lib/reports';
import type { Report, ReportStatus } from '../lib/types';

const TABS: { value: ReportStatus | null; label: string }[] = [
  { value: 'pending', label: 'En attente' },
  { value: 'reviewing', label: 'En vérification' },
  { value: 'validated', label: 'Validés' },
  { value: 'rejected', label: 'Rejetés' },
  { value: 'resolved', label: 'Résolus' },
  { value: null, label: 'Tous' },
];

export default function ReportsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<ReportStatus | null>('pending');
  const [items, setItems] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    listReports(tab)
      .then(setItems)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [tab]);

  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
    []
  );

  return (
    <div>
      <PageHeader
        title="Signalements"
        subtitle="Problèmes signalés par les usagers — un signalement validé devient une information fiable sur le réseau."
      />

      {error && (
        <div className="notice notice-danger" style={{ marginBottom: 16 }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="toolbar">
        <div className="chip-row">
          {TABS.map((t) => (
            <button
              key={t.label}
              className={'chip' + (tab === t.value ? ' active' : '')}
              onClick={() => setTab(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="spacer" />
      </div>

      {loading ? (
        <div className="centered-state">Chargement…</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Siren size={26} />}
          title="Rien ici"
          description="Aucun signalement dans cette catégorie pour le moment."
        />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Concerne</th>
                <th>Description</th>
                <th>Signalé par</th>
                <th>Statut</th>
                <th>Reçu</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} data-clickable onClick={() => navigate(`/signalements/${r.id}`)}>
                  <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{REPORT_TYPE_LABEL[r.type]}</td>
                  <td>
                    {[r.line_code, r.stop_name].filter(Boolean).join(' · ') || (
                      <span style={{ color: 'var(--ink-faint)' }}>—</span>
                    )}
                  </td>
                  <td style={{ maxWidth: 320 }}>
                    <span className="clamp-2">{r.description}</span>
                  </td>
                  <td>
                    {r.reporter_name}
                    <div style={{ color: 'var(--ink-muted)', fontSize: 12 }}>{r.reporter_phone}</div>
                  </td>
                  <td>
                    <span className={'badge-status badge-' + r.status}>{REPORT_STATUS_LABEL[r.status]}</span>
                  </td>
                  <td style={{ color: 'var(--ink-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>
                    {dateFmt.format(new Date(r.created_at))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
