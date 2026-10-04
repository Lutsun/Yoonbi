// Amplitude de service d'une ligne, lue dans son libellé d'horaires
// (`lines.hours_label`, voir supabase/schema.sql) : « Lun-Dim · 6h-21h »,
// « Lun-Ven · heures de pointe (7h-11h, 16h-20h) », « Estimation : tous les
// jours · 6h-20h ». Sert à ne pas proposer un bus qui ne circule pas à
// l'heure où l'on part.

export type ServiceWindow = {
  /** Jours de service, 0 = dimanche … 6 = samedi. */
  days: Set<number>;
  /** Plages de service en minutes depuis minuit, [début, fin[. */
  ranges: [number, number][];
};

const DAYS: Record<string, number> = { dim: 0, lun: 1, mar: 2, mer: 3, jeu: 4, ven: 5, sam: 6 };
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

function dayIndex(word: string): number | undefined {
  return DAYS[word.slice(0, 3).toLowerCase()];
}

function parseDays(label: string): number[] | null {
  if (/tous les jours/i.test(label)) return EVERY_DAY;
  const span = label.match(/\b(lun|mar|mer|jeu|ven|sam|dim)\w*\s*-\s*(lun|mar|mer|jeu|ven|sam|dim)\w*/i);
  if (!span) return null;
  const from = dayIndex(span[1]);
  const to = dayIndex(span[2]);
  if (from === undefined || to === undefined) return null;
  // « Lun-Dim » passe par la fin de semaine : on avance jour par jour.
  const days: number[] = [];
  for (let d = from; ; d = (d + 1) % 7) {
    days.push(d);
    if (d === to) break;
  }
  return days;
}

export function parseServiceWindow(label: string | null | undefined): ServiceWindow | null {
  if (!label) return null;
  const days = parseDays(label);
  const ranges: [number, number][] = [];
  for (const m of label.matchAll(/(\d{1,2})h(\d{2})?\s*-\s*(\d{1,2})h(\d{2})?/g)) {
    const start = Number(m[1]) * 60 + Number(m[2] ?? 0);
    const end = Number(m[3]) * 60 + Number(m[4] ?? 0);
    if (end > start) ranges.push([start, end]);
  }
  // Un libellé qu'on ne sait pas lire ne doit jamais faire disparaître une
  // ligne : sans jours ni heures exploitables, l'amplitude reste inconnue.
  if (!days || ranges.length === 0) return null;
  return { days: new Set(days), ranges };
}

export function isRunning(window: ServiceWindow, at: Date): boolean {
  if (!window.days.has(at.getDay())) return false;
  const minutes = at.getHours() * 60 + at.getMinutes();
  return window.ranges.some(([start, end]) => minutes >= start && minutes < end);
}
