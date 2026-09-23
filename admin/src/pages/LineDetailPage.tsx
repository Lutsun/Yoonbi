import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUp, ArrowDown, X, Plus, AlertCircle, CheckCircle2 } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import {
  getLine,
  getLineStops,
  listOperators,
  listStops,
  saveLine,
  setLineStops,
} from '../lib/api';
import type { Line, LineStop, Operator, Stop } from '../lib/types';

const EMPTY_LINE: Omit<Line, 'id'> = {
  operator_id: '',
  code: '',
  name: '',
  color: '',
  fare_fcfa: 200,
  hours_label: '',
  frequency_label: '',
  schedule_estimated: true,
};

export default function LineDetailPage() {
  const { lineId } = useParams();
  const navigate = useNavigate();
  const isNew = lineId === 'nouvelle';

  const [operators, setOperators] = useState<Operator[]>([]);
  const [allStops, setAllStops] = useState<Stop[]>([]);
  const [line, setLine] = useState<Omit<Line, 'id'> & { id?: string }>(EMPTY_LINE);
  const [sequence, setSequence] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [stopQuery, setStopQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listOperators(),
      listStops(),
      isNew ? Promise.resolve(null) : getLine(lineId!),
      isNew ? Promise.resolve([] as LineStop[]) : getLineStops(lineId!),
    ])
      .then(([ops, stops, existingLine, existingStops]) => {
        if (cancelled) return;
        setOperators(ops);
        setAllStops(stops);
        if (existingLine) setLine(existingLine);
        else if (ops[0]) setLine((l) => ({ ...l, operator_id: ops[0].id }));
        setSequence(existingStops.map((s) => ({ id: s.id, name: s.name })));
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [lineId, isNew]);

  const stopSuggestions = useMemo(() => {
    const q = stopQuery.trim().toLowerCase();
    const chosen = new Set(sequence.map((s) => s.id));
    return allStops
      .filter((s) => !chosen.has(s.id) && (!q || s.name.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [allStops, stopQuery, sequence]);

  const addStop = (stop: Stop) => {
    setSequence((seq) => [...seq, { id: stop.id, name: stop.name }]);
    setStopQuery('');
  };
  const removeStop = (index: number) => {
    setSequence((seq) => seq.filter((_, i) => i !== index));
  };
  const moveStop = (index: number, delta: number) => {
    setSequence((seq) => {
      const target = index + delta;
      if (target < 0 || target >= seq.length) return seq;
      const next = [...seq];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleSave = async () => {
    setSaveError(null);
    if (!line.operator_id || !line.code.trim() || !line.name.trim()) {
      setSaveError('Opérateur, code et nom sont obligatoires.');
      return;
    }
    setSaving(true);
    try {
      const id = await saveLine(line);
      await setLineStops(id, sequence.map((s) => s.id));
      setLine((l) => ({ ...l, id }));
      setSaved(true);
      if (isNew) navigate(`/lignes/${id}`, { replace: true });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Échec de l’enregistrement.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="centered-state">Chargement…</div>;
  if (error)
    return (
      <div className="notice notice-danger">
        <AlertCircle size={16} />
        <span>{error}</span>
      </div>
    );

  return (
    <div>
      <PageHeader
        back={
          <button className="back-link" onClick={() => navigate('/lignes')}>
            <ArrowLeft size={14} />
            Retour aux lignes
          </button>
        }
        title={isNew ? 'Nouvelle ligne' : `Ligne ${line.code}`}
        subtitle="Le tracé (ordre des arrêts) détermine ce que le calcul d'itinéraire de l'app propose."
      />

      <div className="two-col">
        <div className="card">
          <h3>Informations</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label className="field">
              <span>Opérateur</span>
              <select
                value={line.operator_id}
                onChange={(e) => setLine({ ...line, operator_id: e.target.value })}
              >
                {operators.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Code (ex : « Ligne 40 » ou « B1 »)</span>
              <input value={line.code} onChange={(e) => setLine({ ...line, code: e.target.value })} />
            </label>
            <label className="field">
              <span>Nom (ex : « Grand Mbao ↔ Petersen »)</span>
              <input value={line.name} onChange={(e) => setLine({ ...line, name: e.target.value })} />
            </label>
            <label className="field">
              <span>Tarif (FCFA)</span>
              <input
                type="number"
                min={0}
                value={line.fare_fcfa}
                onChange={(e) => setLine({ ...line, fare_fcfa: Number(e.target.value) })}
              />
            </label>
            <label className="field">
              <span>Couleur (facultatif — sinon celle de l'opérateur)</span>
              <input
                type="color"
                value={line.color || '#12B76A'}
                onChange={(e) => setLine({ ...line, color: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Amplitude horaire (ex : « Lun-Dim · 6h-21h »)</span>
              <input
                value={line.hours_label ?? ''}
                onChange={(e) => setLine({ ...line, hours_label: e.target.value })}
                placeholder="Non renseignée"
              />
            </label>
            <label className="field">
              <span>Fréquence (ex : « Toutes les 15 min »)</span>
              <input
                value={line.frequency_label ?? ''}
                onChange={(e) => setLine({ ...line, frequency_label: e.target.value })}
                placeholder="Non renseignée"
              />
            </label>
            <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={line.schedule_estimated}
                onChange={(e) => setLine({ ...line, schedule_estimated: e.target.checked })}
                style={{ width: 'auto' }}
              />
              <span>Horaire estimé (pas confirmé par l'exploitant)</span>
            </label>

            {saveError && (
              <div className="notice notice-danger">
                <AlertCircle size={16} />
                <span>{saveError}</span>
              </div>
            )}
            {saved && !saveError && (
              <div className="notice notice-info">
                <CheckCircle2 size={16} />
                <span>Enregistré.</span>
              </div>
            )}

            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>

        <div className="card">
          <h3>
            Tracé — {sequence.length} arrêt{sequence.length > 1 ? 's' : ''}
          </h3>
          {sequence.length < 2 && (
            <div className="notice notice-warning" style={{ marginBottom: 12 }}>
              <AlertCircle size={16} />
              <span>Il faut au moins 2 arrêts pour que cette ligne soit utilisable.</span>
            </div>
          )}

          <div className="stop-picker">
            <div className="stop-sequence-list">
              {sequence.map((s, i) => (
                <div key={s.id + i} className="stop-sequence-item">
                  <span className="seq-num">{i + 1}</span>
                  <span className="name">{s.name}</span>
                  <div className="move-buttons">
                    <button className="btn btn-icon" onClick={() => moveStop(i, -1)} disabled={i === 0} title="Monter">
                      <ArrowUp size={14} />
                    </button>
                    <button
                      className="btn btn-icon"
                      onClick={() => moveStop(i, 1)}
                      disabled={i === sequence.length - 1}
                      title="Descendre"
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button className="btn btn-icon btn-danger" onClick={() => removeStop(i)} title="Retirer">
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <label className="field" style={{ marginTop: 8 }}>
              <span>Ajouter un arrêt</span>
              <input
                type="search"
                placeholder="Chercher un arrêt…"
                value={stopQuery}
                onChange={(e) => setStopQuery(e.target.value)}
              />
            </label>
            {stopQuery && stopSuggestions.length > 0 && (
              <div className="table-wrap">
                {stopSuggestions.map((s) => (
                  <div key={s.id} className="stop-suggestion" onClick={() => addStop(s)}>
                    <span>{s.name}</span>
                    <span className="stop-suggestion-add">
                      <Plus size={13} />
                      Ajouter
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
