import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Inbox } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import { listSubmissions } from '../lib/api';
import type { Submission, SubmissionStatus } from '../lib/types';

const TABS: { value: SubmissionStatus | null; label: string }[] = [
  { value: 'pending', label: 'En attente' },
  { value: 'approved', label: 'Validées' },
  { value: 'rejected', label: 'Refusées' },
  { value: null, label: 'Toutes' },
];

const STATUS_LABEL: Record<SubmissionStatus, string> = {
  pending: 'En attente',
  approved: 'Validée',
  rejected: 'Refusée',
};

export default function ContributionsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<SubmissionStatus | null>('pending');
  const [items, setItems] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    listSubmissions(tab)
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
        title="Contributions"
        subtitle="Lignes signalées par les usagers — à relire avant qu'elles rejoignent le réseau."
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
          icon={<Inbox size={26} />}
          title="Rien ici"
          description="Aucune contribution dans cette catégorie pour le moment."
        />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ligne proposée</th>
                <th>Contributeur</th>
                <th>Arrêts</th>
                <th>Statut</th>
                <th>Envoyée</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id} data-clickable onClick={() => navigate(`/contributions/${s.id}`)}>
                  <td style={{ fontWeight: 600 }}>
                    {s.line_label}
                    {s.operator_hint && (
                      <span style={{ color: 'var(--ink-muted)', fontWeight: 400 }}> · {s.operator_hint}</span>
                    )}
                  </td>
                  <td>
                    {s.contributor_name}
                    <div style={{ color: 'var(--ink-muted)', fontSize: 12 }}>{s.contributor_phone}</div>
                  </td>
                  <td>{s.stop_count}</td>
                  <td>
                    <span className={'badge-status badge-' + s.status}>{STATUS_LABEL[s.status]}</span>
                  </td>
                  <td style={{ color: 'var(--ink-muted)', fontSize: 12 }}>{dateFmt.format(new Date(s.created_at))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
