import { supabase } from './supabase';
import { Report, ReportStatus, ReportType } from '../types/reports';

// Envoie un signalement : la fonction `submit_report` (supabase/reports.sql)
// l'enregistre « En attente », après avoir vérifié la description et la
// limite d'envoi (5 signalements par 24 h et par compte).
export async function submitReport(params: {
  type: ReportType;
  lineId?: string;
  stopId?: string;
  description: string;
  location?: { latitude: number; longitude: number; accuracy: number | null };
}): Promise<string> {
  const { data, error } = await supabase.rpc('submit_report', {
    p_type: params.type,
    p_line_id: params.lineId ?? null,
    p_stop_id: params.stopId ?? null,
    p_description: params.description,
    p_latitude: params.location?.latitude ?? null,
    p_longitude: params.location?.longitude ?? null,
    p_accuracy_meters: params.location?.accuracy ?? null,
  });
  if (error) throw error;
  return data as string;
}

type ReportRow = {
  id: string;
  type: ReportType;
  line_code: string | null;
  stop_name: string | null;
  description: string;
  status: ReportStatus;
  review_note: string | null;
  created_at: string;
};

export async function getMyReports(): Promise<Report[]> {
  const { data, error } = await supabase.rpc('my_reports');
  if (error) throw error;
  return (data as ReportRow[]).map((row) => ({
    id: row.id,
    type: row.type,
    lineCode: row.line_code ?? undefined,
    stopName: row.stop_name ?? undefined,
    description: row.description,
    status: row.status,
    reviewNote: row.review_note ?? undefined,
    createdAt: row.created_at,
  }));
}
