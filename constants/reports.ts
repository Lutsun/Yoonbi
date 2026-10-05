import { Ionicons } from '@expo/vector-icons';
import { ReportStatus, ReportType } from '../types/reports';

// Libellés des signalements, partagés par le formulaire et « Mes signalements ».
export const REPORT_TYPES: { value: ReportType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'wrong_stop', label: 'Arrêt incorrect', icon: 'location-outline' },
  { value: 'line_issue', label: 'Problème de ligne', icon: 'git-branch-outline' },
  { value: 'disruption', label: 'Perturbation', icon: 'warning-outline' },
  { value: 'strike', label: 'Grève', icon: 'hand-left-outline' },
  { value: 'delay', label: 'Retard', icon: 'time-outline' },
  { value: 'other', label: 'Autre', icon: 'ellipsis-horizontal-circle-outline' },
];

export const REPORT_TYPE_LABEL = Object.fromEntries(REPORT_TYPES.map((t) => [t.value, t.label])) as Record<
  ReportType,
  string
>;

export const REPORT_STATUS: Record<ReportStatus, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  pending: { label: 'En attente', icon: 'time-outline' },
  reviewing: { label: 'En cours de vérification', icon: 'search-outline' },
  validated: { label: 'Validé', icon: 'checkmark-circle' },
  rejected: { label: 'Rejeté', icon: 'close-circle' },
  resolved: { label: 'Résolu', icon: 'checkmark-done-circle' },
};
