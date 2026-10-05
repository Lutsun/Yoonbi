export type Operator = {
  id: string;
  name: string;
  short_name: string;
  color: string;
};

export type Line = {
  id: string;
  operator_id: string;
  code: string;
  name: string;
  color: string | null;
  fare_fcfa: number;
  hours_label: string | null;
  frequency_label: string | null;
  schedule_estimated: boolean;
};

export type Stop = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  line_count: number;
};

export type LineStop = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  sequence: number;
};

export type YoonbiUser = {
  id: string;
  full_name: string;
  city: string | null;
  phone: string;
  created_at: string;
  saved_trips: number;
  favorite_lines: number;
};

export type Stats = {
  operators: number;
  lines: number;
  stops: number;
  users: number;
  saved_trips: number;
  favorite_lines: number;
  pending_submissions: number;
  orphan_stops: number;
  short_lines: number;
  lines_by_operator: { operator: string; color: string; lines: number }[];
  popular_lines: { code: string; name: string; operator: string; favorites: number }[];
};

export type SubmissionStatus = 'pending' | 'approved' | 'rejected';

export type Submission = {
  id: string;
  line_label: string;
  operator_hint: string | null;
  fare_fcfa: number | null;
  note: string | null;
  status: SubmissionStatus;
  contributor_name: string;
  contributor_phone: string;
  stop_count: number;
  created_at: string;
};

export type SubmissionStop = {
  sequence: number;
  name: string;
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
};

// Signalements des usagers — voir supabase/reports.sql.
export type ReportType = 'wrong_stop' | 'line_issue' | 'disruption' | 'strike' | 'delay' | 'other';

// En attente → En cours de vérification → Validé / Rejeté → Résolu
export type ReportStatus = 'pending' | 'reviewing' | 'validated' | 'rejected' | 'resolved';

export type Report = {
  id: string;
  type: ReportType;
  line_id: string | null;
  line_code: string | null;
  line_name: string | null;
  stop_id: string | null;
  stop_name: string | null;
  description: string;
  latitude: number | null;
  longitude: number | null;
  accuracy_meters: number | null;
  status: ReportStatus;
  review_note: string | null;
  reviewed_at: string | null;
  reporter_name: string;
  reporter_phone: string;
  created_at: string;
};
