import type { ReportStatus, ReportType } from './types';

// Libellés partagés par la liste et le détail des signalements.
export const REPORT_TYPE_LABEL: Record<ReportType, string> = {
  wrong_stop: 'Arrêt incorrect',
  line_issue: 'Problème de ligne',
  disruption: 'Perturbation',
  strike: 'Grève',
  delay: 'Retard',
  other: 'Autre',
};

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  pending: 'En attente',
  reviewing: 'En cours de vérification',
  validated: 'Validé',
  rejected: 'Rejeté',
  resolved: 'Résolu',
};
