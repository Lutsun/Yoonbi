// Une ligne proposée par un usager, en attente (ou non) de relecture admin —
// voir supabase/contributions.sql.
export type SubmissionStatus = 'pending' | 'approved' | 'rejected';

export type MarkedStop = {
  name: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
};

export type LineSubmission = {
  id: string;
  lineLabel: string;
  operatorHint?: string;
  fareFcfa?: number;
  status: SubmissionStatus;
  reviewNote?: string;
  stopCount: number;
  createdAt: string;
};
