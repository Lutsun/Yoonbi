import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MapContainer, Marker, Polyline, Popup, TileLayer } from 'react-leaflet';
import { ArrowLeft, AlertCircle, Check, X } from 'lucide-react';
import '../components/LeafletIconFix';
import PageHeader from '../components/PageHeader';
import { getSubmissionStops, listSubmissions, reviewSubmission, saveStop } from '../lib/api';
import type { Submission, SubmissionStop } from '../lib/types';

export default function ContributionDetailPage() {
  const { submissionId } = useParams();
  const navigate = useNavigate();

  const [submission, setSubmission] = useState<Submission | null>(null);
  const [stops, setStops] = useState<SubmissionStop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listSubmissions(null), getSubmissionStops(submissionId!)])
      .then(([all, submissionStops]) => {
        if (cancelled) return;
        const found = all.find((s) => s.id === submissionId) ?? null;
        setSubmission(found);
        setStops(submissionStops);
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [submissionId]);

  const center = useMemo<[number, number]>(() => {
    if (stops.length === 0) return [14.6928, -17.4467];
    return [
      stops.reduce((sum, s) => sum + s.latitude, 0) / stops.length,
      stops.reduce((sum, s) => sum + s.longitude, 0) / stops.length,
    ];
  }, [stops]);

  const path = useMemo<[number, number][]>(
    () => stops.map((s) => [s.latitude, s.longitude]),
    [stops]
  );

  const handleApprove = async () => {
    if (!submission || working) return;
    setWorking(true);
    setError(null);
    try {
      // Les points relevés sont créés comme de vrais arrêts — l'admin les a
      // déjà vus sur la carte ci-dessus ; la validation, c'est ça.
      const createdStops = [];
      for (const stop of stops) {
        const id = await saveStop({ name: stop.name, latitude: stop.latitude, longitude: stop.longitude });
        createdStops.push({ id, name: stop.name });
      }
      navigate('/lignes/nouvelle', {
        state: {
          contribution: {
            submissionId: submission.id,
            name: submission.line_label,
            fareFcfa: submission.fare_fcfa ?? undefined,
            sequence: createdStops,
          },
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de la création des arrêts.');
      setWorking(false);
    }
  };

  const handleReject = async () => {
    if (!submission || working) return;
    const reason = window.prompt(
      `Pourquoi refuser « ${submission.line_label} » ? Ce motif sera visible par le contributeur.`
    );
    if (reason === null) return;
    setWorking(true);
    setError(null);
    try {
      await reviewSubmission({ submissionId: submission.id, approve: false, reviewNote: reason });
      navigate('/contributions');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec du refus.');
      setWorking(false);
    }
  };

  if (loading) return <div className="centered-state">Chargement…</div>;
  if (error && !submission)
    return (
      <div className="notice notice-danger">
        <AlertCircle size={16} />
        <span>{error}</span>
      </div>
    );
  if (!submission) return <div className="centered-state">Contribution introuvable.</div>;

  return (
    <div>
      <PageHeader
        back={
          <button className="back-link" onClick={() => navigate('/contributions')}>
            <ArrowLeft size={14} />
            Retour aux contributions
          </button>
        }
        title={submission.line_label}
        subtitle={`Proposée par ${submission.contributor_name} (${submission.contributor_phone}) · ${stops.length} arrêts`}
      />

      {error && (
        <div className="notice notice-danger" style={{ marginBottom: 16 }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="two-col">
        <div className="card">
          <h3>Détails</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13.5 }}>
            <div>
              <strong>Opérateur indiqué :</strong> {submission.operator_hint || '—'}
            </div>
            <div>
              <strong>Tarif indiqué :</strong> {submission.fare_fcfa ? `${submission.fare_fcfa} FCFA` : '—'}
            </div>
            {submission.note && (
              <div>
                <strong>Note du contributeur :</strong> « {submission.note} »
              </div>
            )}
          </div>

          {submission.status === 'pending' && (
            <div className="modal-actions" style={{ marginTop: 20 }}>
              <button className="btn btn-danger" onClick={handleReject} disabled={working}>
                <X size={15} />
                Refuser
              </button>
              <button className="btn btn-primary" onClick={handleApprove} disabled={working}>
                <Check size={15} />
                {working ? 'Création des arrêts…' : 'Créer les arrêts et ouvrir la ligne'}
              </button>
            </div>
          )}
          {submission.status !== 'pending' && (
            <div className="notice notice-info" style={{ marginTop: 20 }}>
              <span>
                Déjà {submission.status === 'approved' ? 'validée' : 'refusée'} — rien d'autre à faire ici.
              </span>
            </div>
          )}
        </div>

        <div className="card">
          <h3>Arrêts relevés — dans l'ordre</h3>
          <div className="map-container" style={{ marginBottom: 14 }}>
            <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {path.length > 1 && <Polyline positions={path} color="#12B76A" weight={4} />}
              {stops.map((s, i) => (
                <Marker key={i} position={[s.latitude, s.longitude]}>
                  <Popup>
                    <strong>
                      {i + 1}. {s.name}
                    </strong>
                    {s.accuracy_meters != null && (
                      <>
                        <br />
                        précision : {Math.round(s.accuracy_meters)} m
                      </>
                    )}
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>

          <div className="stop-sequence-list">
            {stops.map((s, i) => (
              <div key={i} className="stop-sequence-item">
                <span className="seq-num">{i + 1}</span>
                <span className="name">{s.name}</span>
                <span style={{ color: 'var(--ink-muted)', fontSize: 12 }}>
                  {s.accuracy_meters != null ? `± ${Math.round(s.accuracy_meters)} m` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
