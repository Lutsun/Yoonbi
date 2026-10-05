// Un problème signalé par un usager sur le réseau — voir supabase/reports.sql.
export type ReportType = 'wrong_stop' | 'line_issue' | 'disruption' | 'strike' | 'delay' | 'other';

// En attente → En cours de vérification → Validé / Rejeté → Résolu
export type ReportStatus = 'pending' | 'reviewing' | 'validated' | 'rejected' | 'resolved';

export type Report = {
  id: string;
  type: ReportType;
  lineCode?: string;
  stopName?: string;
  description: string;
  status: ReportStatus;
  reviewNote?: string;
  createdAt: string;
};
