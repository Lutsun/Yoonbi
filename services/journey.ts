import { getLineSchedules, getNearbyStops, getRouteGraph } from './transit';
import {
  buildRouteGraph,
  pickBestOptions,
  planFromPosition,
  planTripOptions,
  RouteGraph,
  USER_POSITION_ID,
  withEgressWalk,
} from './routing';
import { formatServiceStart, isRunning, nextServiceStart, parseServiceWindow, ServiceWindow } from './serviceHours';
import { LatLng, RouteGraphRow, Stop, TripOption, TripPlan } from '../types/transit';

// Planification d'un trajet complet, quel que soit le départ (position GPS
// ou arrêt) et la destination (arrêt du réseau ou lieu quelconque). Partagé
// par l'écran de recherche et par le recalcul en plein guidage.

type Schedule = { window: ServiceWindow; estimated: boolean };

type Network = {
  rows: RouteGraphRow[];
  schedules: Map<string, Schedule>;
  /** Graphes déjà construits, par ensemble de lignes écartées. */
  graphs: Map<string, RouteGraph>;
};

// Le réseau ne change pas pendant une session : on le garde en mémoire pour
// ne pas le recharger à chaque recherche.
let cachedNetwork: Network | null = null;

async function network(): Promise<Network> {
  if (cachedNetwork) return cachedNetwork;
  const [rows, scheduleRows] = await Promise.all([getRouteGraph(), getLineSchedules()]);
  const schedules = new Map<string, Schedule>();
  for (const row of scheduleRows) {
    const window = parseServiceWindow(row.hours_label);
    if (window) schedules.set(row.id, { window, estimated: row.schedule_estimated });
  }
  cachedNetwork = { rows, schedules, graphs: new Map() };
  return cachedNetwork;
}

function graphWithout(net: Network, excluded: Set<string>): RouteGraph {
  const key = [...excluded].sort().join(',');
  let graph = net.graphs.get(key);
  if (!graph) {
    graph = buildRouteGraph(excluded.size ? net.rows.filter((r) => !excluded.has(r.line_id)) : net.rows);
    net.graphs.set(key, graph);
  }
  return graph;
}

export type JourneyOrigin = { position: LatLng } | { stop: Stop };

export type JourneyResult =
  | { status: 'ok'; origin: Stop; options: TripOption[] }
  | { status: 'no-path' }
  | { status: 'same-stop' }
  /**
   * Un trajet existe, mais aucune de ses lignes ne circule à cette heure.
   * `message` dit lesquelles, et quand le service reprend.
   */
  | { status: 'no-service'; message: string };

// Arrêts accessibles à pied : d'abord dans un rayon de marche raisonnable,
// sinon un peu plus loin.
async function stopsAround(point: LatLng, near: number, far: number): Promise<Stop[]> {
  const close = await getNearbyStops(point.latitude, point.longitude, near);
  return close.length > 0 ? close : getNearbyStops(point.latitude, point.longitude, far);
}

async function optionsOn(
  graph: RouteGraph,
  origin: Stop,
  position: LatLng | null,
  destination: Stop
): Promise<TripOption[] | 'same-stop'> {
  if (destination.isPlace) {
    // Un lieu n'est pas un arrêt : on vise les arrêts les plus proches de lui,
    // puis on ajoute la marche finale jusqu'à sa porte.
    const exits = await stopsAround(destination, 1000, 2500);
    if (exits.length === 0) return [];
    const starts = position ? await stopsAround(position, 1200, 3000) : [];

    const plans: TripPlan[] = [];
    for (const exit of exits.slice(0, 3)) {
      const found = position
        ? planFromPosition(graph, position, starts, exit.id)
        : planTripOptions(graph, origin.id, exit.id);
      for (const option of found) {
        if (option.plan.segments.length === 0) continue;
        plans.push(withEgressWalk(option.plan, exit, destination));
      }
    }
    return pickBestOptions(plans);
  }

  if (position) {
    // Départ réel : on compare plusieurs arrêts accessibles à pied.
    const starts = await stopsAround(position, 1200, 3000);
    return planFromPosition(graph, position, starts, destination.id);
  }

  const options = planTripOptions(graph, origin.id, destination.id);
  if (options.length > 0 && options[0].plan.segments.length === 0) return 'same-stop';
  return options;
}

// Ligne à l'horaire seulement estimé, utilisée hors de son amplitude : on la
// propose quand même (l'estimation peut être fausse), mais en le disant.
function withServiceWarning(option: TripOption, net: Network, at: Date): TripOption {
  const doubtful = option.plan.segments.filter((s) => {
    if (s.type !== 'ride') return false;
    const schedule = net.schedules.get(s.lineId);
    return !!schedule && schedule.estimated && !isRunning(schedule.window, at);
  });
  if (doubtful.length === 0) return option;
  const codes = [...new Set(doubtful.map((s) => (s.type === 'ride' ? s.lineCode : '')))].join(', ');
  return {
    ...option,
    warning: `${codes} : ne circule peut-être plus à cette heure (horaire estimé)`,
  };
}

// Quand une option redevient possible : quand TOUTES ses lignes fermées ont
// repris (null si l'une d'elles n'a pas d'horaire exploitable).
function resumeOf(option: TripOption, net: Network, closed: Set<string>, at: Date): Date | null {
  let resume: Date | null = null;
  for (const segment of option.plan.segments) {
    if (segment.type !== 'ride' || !closed.has(segment.lineId)) continue;
    const schedule = net.schedules.get(segment.lineId);
    const start = schedule ? nextServiceStart(schedule.window, at) : null;
    if (!start) return null;
    if (!resume || start > resume) resume = start;
  }
  return resume;
}

// « Le B1 ne circule plus à cette heure — reprise demain à 6h. » On annonce
// l'option qui redevient possible le plus tôt, pas forcément la plus rapide.
function noServiceMessage(options: TripOption[], net: Network, closed: Set<string>, at: Date): string {
  let best = options[0];
  let bestResume = resumeOf(best, net, closed, at);
  for (const option of options.slice(1)) {
    const resume = resumeOf(option, net, closed, at);
    if (resume && (!bestResume || resume < bestResume)) {
      best = option;
      bestResume = resume;
    }
  }
  const codes = [
    ...new Set(
      best.plan.segments.flatMap((s) => (s.type === 'ride' && closed.has(s.lineId) ? [s.lineCode] : []))
    ),
  ];
  const subject = codes.length > 1 ? `Les lignes ${codes.join(', ')} ne circulent` : `Le ${codes[0]} ne circule`;
  return bestResume
    ? `${subject} plus à cette heure — reprise ${formatServiceStart(bestResume, at)}.`
    : `${subject} pas à cette heure.`;
}

export async function planJourney(
  from: JourneyOrigin,
  destination: Stop,
  at: Date = new Date()
): Promise<JourneyResult> {
  const net = await network();
  const position = 'position' in from ? from.position : null;
  const origin: Stop = position
    ? { id: USER_POSITION_ID, name: 'Ma position', latitude: position.latitude, longitude: position.longitude }
    : (from as { stop: Stop }).stop;

  // Une ligne dont l'horaire est confirmé par l'exploitant (BRT) et qui ne
  // circule pas maintenant n'est jamais proposée : pas de B3 un dimanche.
  const closed = new Set<string>();
  for (const [lineId, schedule] of net.schedules) {
    if (!schedule.estimated && !isRunning(schedule.window, at)) closed.add(lineId);
  }

  const options = await optionsOn(graphWithout(net, closed), origin, position, destination);
  if (options === 'same-stop') return { status: 'same-stop' };

  if (options.length === 0) {
    if (closed.size === 0) return { status: 'no-path' };
    // Sans les lignes fermées, plus de trajet : on distingue « pas relié » de
    // « relié, mais pas à cette heure ».
    const anytime = await optionsOn(graphWithout(net, new Set()), origin, position, destination);
    if (anytime === 'same-stop' || anytime.length === 0) return { status: 'no-path' };
    return { status: 'no-service', message: noServiceMessage(anytime, net, closed, at) };
  }

  return { status: 'ok', origin, options: preferReliable(options.map((o) => withServiceWarning(o, net, at))) };
}

// Un bus qui ne passe peut-être plus ne doit pas être recommandé s'il ne fait
// gagner que quelques minutes sur une option sûre (autre ligne, ou à pied).
const RELIABILITY_MARGIN_MINUTES = 10;

function preferReliable(options: TripOption[]): TripOption[] {
  const [first, ...rest] = options;
  if (!first?.warning) return options;
  const safe = rest.find(
    (o) => !o.warning && o.plan.totalMinutes <= first.plan.totalMinutes + RELIABILITY_MARGIN_MINUTES
  );
  if (!safe) return options;
  return [safe, first, ...rest.filter((o) => o !== safe)].map((o, i) => ({ ...o, recommended: i === 0 }));
}
