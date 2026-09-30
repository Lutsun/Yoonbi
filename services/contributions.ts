import { supabase } from './supabase';
import { LineSubmission, MarkedStop } from '../types/contributions';

// Envoie une ligne proposée par un usager : la fonction PostGIS
// `submit_line_contribution` (supabase/contributions.sql) crée la
// contribution ET ses arrêts en une seule opération, et refuse s'il y a déjà
// trop de contributions en attente pour ce compte.
export async function submitLineContribution(params: {
  lineLabel: string;
  operatorHint?: string;
  fareFcfa?: number;
  note?: string;
  stops: MarkedStop[];
}): Promise<string> {
  const { data, error } = await supabase.rpc('submit_line_contribution', {
    p_line_label: params.lineLabel,
    p_operator_hint: params.operatorHint ?? null,
    p_fare_fcfa: params.fareFcfa ?? null,
    p_note: params.note ?? null,
    p_stops: params.stops.map((s) => ({
      name: s.name,
      latitude: s.latitude,
      longitude: s.longitude,
      accuracy_meters: s.accuracyMeters,
    })),
  });
  if (error) throw error;
  return data as string;
}

type SubmissionRow = {
  id: string;
  line_label: string;
  operator_hint: string | null;
  fare_fcfa: number | null;
  status: LineSubmission['status'];
  review_note: string | null;
  stop_count: number;
  created_at: string;
};

export async function getMyLineSubmissions(): Promise<LineSubmission[]> {
  const { data, error } = await supabase.rpc('my_line_submissions');
  if (error) throw error;
  return (data as SubmissionRow[]).map((row) => ({
    id: row.id,
    lineLabel: row.line_label,
    operatorHint: row.operator_hint ?? undefined,
    fareFcfa: row.fare_fcfa ?? undefined,
    status: row.status,
    reviewNote: row.review_note ?? undefined,
    stopCount: row.stop_count,
    createdAt: row.created_at,
  }));
}
