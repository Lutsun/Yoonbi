import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MapContainer, Marker, TileLayer } from 'react-leaflet';
import { ArrowLeft, AlertCircle, Check, CheckCheck, SearchCheck, X } from 'lucide-react';
import '../components/LeafletIconFix';
import PageHeader from '../components/PageHeader';
import { listReports, setReportStatus } from '../lib/api';
import { REPORT_STATUS_LABEL, REPORT_TYPE_LABEL } from '../lib/reports';
import type { Report, ReportStatus } from '../lib/types';

// Le parcours d'un signalement, affiché en frise : la 3e étape est « Validé »
// ou « Rejeté » selon la décision, « Validé / Rejeté » tant qu'elle n'est pas
// prise (ou une fois le signalement résolu).
const STEP_OF: Record<ReportStatus, number> = { pending: 0, reviewing: 1, validated: 2, rejected: 2, resolved: 3 };

export default function ReportDetailPage() {
  const { reportId } = useParams();
  const navigate = useNavigate();

  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const load = useCallback(
    () =>
      listReports(null).then((all) => {
        setReport(all.find((r) => r.id === reportId) ?? null);
      }),
    [reportId]
  );

  useEffect(() => {
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [load]);

  const dateFmt = useMemo(
    () =>
      new Intl.DateTimeFormat('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    []
  );

  const change = async (status: Exclude<ReportStatus, 'pending'>, note?: string) => {
    if (!report || working) return;
    setWorking(true);
    setError(null);
    try {
      await setReportStatus({ reportId: report.id, status, note });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec du changement de statut.');
    } finally {
      setWorking(false);
    }
  };

  const handleReject = () => {
    const reason = window.prompt('Pourquoi rejeter ce signalement ? Ce motif sera visible par l’usager.');
    if (reason === null) return;
    change('rejected', reason);
  };

  const handleValidate = () => {
    const note = window.prompt(
      'Valider ce signalement ? Il sera enregistré comme information fiable sur le réseau.\n\nMessage pour l’usager (facultatif) :',
      ''
    );
    if (note === null) return;
    change('validated', note);
  };

  if (loading) return <div className="centered-state">Chargement…</div>;
  if (error && !report)
    return (
      <div className="notice notice-danger">
        <AlertCircle size={16} />
        <span>{error}</span>
      </div>
    );
  if (!report) return <div className="centered-state">Signalement introuvable.</div>;

  const hasLocation = report.latitude != null && report.longitude != null;
  const current = STEP_OF[report.status];
  const decision =
    report.status === 'validated' || report.status === 'rejected'
      ? REPORT_STATUS_LABEL[report.status]
      : 'Validé / Rejeté';
  const steps = [REPORT_STATUS_LABEL.pending, REPORT_STATUS_LABEL.reviewing, decision, REPORT_STATUS_LABEL.resolved];

  return (
    <div>
      <PageHeader
        back={
          <button className="back-link" onClick={() => navigate('/signalements')}>
            <ArrowLeft size={14} />
            Retour aux signalements
          </button>
        }
        title={REPORT_TYPE_LABEL[report.type]}
        subtitle={`Signalé par ${report.reporter_name} (${report.reporter_phone}) · ${dateFmt.format(
          new Date(report.created_at)
        )}`}
      />

      {error && (
        <div className="notice notice-danger" style={{ marginBottom: 16 }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="status-steps">
        {steps.map((label, i) => (
          <div
            key={i}
            className={'status-step' + (i <= current ? ' reached' : '') + (i === current ? ' current' : '')}
          >
            <span className="status-step-dot">{i + 1}</span>
            {label}
          </div>
        ))}
      </div>

      <div className="two-col">
        <div className="card">
          <h3>Détails</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13.5 }}>
            <div>
              <strong>Statut :</strong>{' '}
              <span className={'badge-status badge-' + report.status}>{REPORT_STATUS_LABEL[report.status]}</span>
            </div>
            <div>
              <strong>Ligne :</strong>{' '}
              {report.line_code ? `${report.line_code}${report.line_name ? ` — ${report.line_name}` : ''}` : '—'}
            </div>
            <div>
              <strong>Arrêt :</strong> {report.stop_name ?? '—'}
            </div>
            <div>
              <strong>Description :</strong>
              <p style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>« {report.description} »</p>
            </div>
            {report.review_note && (
              <div>
                <strong>Message à l’usager :</strong> « {report.review_note} »
              </div>
            )}
          </div>

          <div className="modal-actions" style={{ marginTop: 20 }}>
            {report.status === 'pending' && (
              <button className="btn btn-primary" onClick={() => change('reviewing')} disabled={working}>
                <SearchCheck size={15} />
                Passer en cours de vérification
              </button>
            )}
            {report.status === 'reviewing' && (
              <>
                <button className="btn btn-danger" onClick={handleReject} disabled={working}>
                  <X size={15} />
                  Rejeter
                </button>
                <button className="btn btn-primary" onClick={handleValidate} disabled={working}>
                  <Check size={15} />
                  Valider
                </button>
              </>
            )}
            {(report.status === 'validated' || report.status === 'rejected') && (
              <button className="btn btn-primary" onClick={() => change('resolved')} disabled={working}>
                <CheckCheck size={15} />
                Marquer comme résolu
              </button>
            )}
          </div>

          {report.status === 'validated' && (
            <div className="notice notice-info" style={{ marginTop: 16 }}>
              <span>
                Enregistré comme information fiable sur le réseau. Marquez-le résolu quand le problème
                n’est plus d’actualité.
              </span>
            </div>
          )}
          {report.status === 'resolved' && (
            <div className="notice notice-info" style={{ marginTop: 16 }}>
              <span>Résolu — rien d’autre à faire ici.</span>
            </div>
          )}
        </div>

        <div className="card">
          <h3>Position de l’usager au moment du signalement</h3>
          {hasLocation ? (
            <>
              <div className="map-container" style={{ marginBottom: 10 }}>
                <MapContainer
                  center={[report.latitude!, report.longitude!]}
                  zoom={16}
                  style={{ height: '100%', width: '100%' }}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <Marker position={[report.latitude!, report.longitude!]} />
                </MapContainer>
              </div>
              <div style={{ color: 'var(--ink-muted)', fontSize: 12 }}>
                {report.latitude!.toFixed(5)}, {report.longitude!.toFixed(5)}
                {report.accuracy_meters != null && ` · précision ± ${Math.round(report.accuracy_meters)} m`}
              </div>
            </>
          ) : (
            <div style={{ color: 'var(--ink-muted)', fontSize: 13 }}>Position non transmise.</div>
          )}
        </div>
      </div>
    </div>
  );
}
