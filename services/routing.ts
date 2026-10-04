// Planificateur d'itinéraire — la fonctionnalité principale de Yoonbi.
//
// Construit un graphe de trajet à partir du réseau complet (toutes les
// lignes et leurs arrêts, voir get_route_graph dans supabase/schema.sql),
// puis calcule le meilleur itinéraire entre deux arrêts avec l'algorithme
// de Dijkstra : quelles lignes prendre, où descendre, où correspondre,
// le temps estimé et le coût estimé.
//
// Simplifications assumées (clairement estimées, pas mesurées) :
//  - vitesse moyenne d'un bus en ville : 16 km/h
//  - vitesse de marche à pied : 4,5 km/h
//  - attente moyenne avant un bus : 6 minutes, comptée à chaque montée
//  - correspondance à pied possible entre deux arrêts distants de 350 m ou moins
//  - chaque ligne dessert ses arrêts dans les deux sens

import { distanceKm } from '../utils/eta';
import {
  LatLng,
  RouteGraphRow,
  Stop,
  StopRef,
  TripOption,
  TripPlan,
  TripSegment,
} from '../types/transit';

// Vitesses commerciales, arrêts et circulation compris. Source : le BRT relie
// Guédiawaye à Petersen (18,3 km) en 45 min, contre 90 min en bus classique
// sur le même axe (Bureau Information Gouvernementale, CETUD) — soit environ
// 24 km/h en voie réservée et 12 km/h dans la circulation.
const BRT_SPEED_KMH = 24;
const BUS_SPEED_KMH = 12;
const WALK_SPEED_KMH = 4.5;
// Attente moyenne à l'arrêt : la moitié de l'intervalle entre deux bus. Le BRT
// passe toutes les 6 min (sunubrt.sn) ; pour les autres réseaux, sans horaire
// publié, on retient une hypothèse de 6 min.
const BRT_WAIT_MINUTES = 3;
const BOARD_WAIT_MINUTES = 6;
// Une correspondance coûte plus que le temps qu'elle prend (risque de rater
// le bus, descendre, chercher l'arrêt) : comme les applis de transport, on
// préfère un trajet direct à un trajet à peine plus court avec changement.
// Cette pénalité influence le choix du trajet, jamais la durée affichée.
const BOARDING_PENALTY_MINUTES = 5;
// Distance à vol d'oiseau → distance par la route : négligeable entre deux
// arrêts proches, nettement plus marquée entre deux arrêts éloignés.
const SHORT_HOP_KM = 0.6;
const LONG_HOP_DETOUR = 1.3;
const WALK_TRANSFER_RADIUS_KM = 0.35;
// En dessous, on considère que l'utilisateur est déjà à l'arrêt : inutile de
// lui afficher une étape "marcher 20 m".
const MIN_ACCESS_WALK_KM = 0.06;

// Identifiant du « point de départ » quand le trajet commence à la position
// GPS de l'utilisateur plutôt qu'à un arrêt.
export const USER_POSITION_ID = 'user-position';

type GraphStop = { id: string; name: string; latitude: number; longitude: number };

type RideEdge = {
  kind: 'ride';
  toStopId: string;
  minutes: number;
  lineId: string;
  lineCode: string;
  lineName: string;
  lineColor: string;
  operatorShortName: string;
  fareFcfa: number;
};

type WalkEdge = { kind: 'walk'; toStopId: string; minutes: number };

export type RouteGraph = {
  stops: Map<string, GraphStop>;
  rideEdges: Map<string, RideEdge[]>;
  walkEdges: Map<string, WalkEdge[]>;
  /** Arrêts de chaque ligne dans l'ordre — pour connaître la direction du bus. */
  lineStops: Map<string, string[]>;
};

function rideMinutes(km: number, operatorShortName: string): number {
  const roadKm = km < SHORT_HOP_KM ? km : km * LONG_HOP_DETOUR;
  const speed = operatorShortName === 'BRT' ? BRT_SPEED_KMH : BUS_SPEED_KMH;
  return (roadKm / speed) * 60;
}

function waitMinutes(operatorShortName: string): number {
  return operatorShortName === 'BRT' ? BRT_WAIT_MINUTES : BOARD_WAIT_MINUTES;
}

function addEdge<T>(map: Map<string, T[]>, fromId: string, edge: T) {
  const list = map.get(fromId);
  if (list) list.push(edge);
  else map.set(fromId, [edge]);
}

// Emprise large de Dakar et sa banlieue — un arrêt en dehors (coordonnées
// nulles, inversées, ou une position GPS aberrante captée pendant une
// contribution) est exclu du graphe plutôt que de produire un tracé
// absurde : mieux vaut un arrêt manquant qu'un arrêt affiché en pleine mer.
const SENEGAL_BOUNDS = { minLat: 12, maxLat: 17, minLng: -18, maxLng: -11 };

function hasValidCoordinates(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= SENEGAL_BOUNDS.minLat &&
    lat <= SENEGAL_BOUNDS.maxLat &&
    lng >= SENEGAL_BOUNDS.minLng &&
    lng <= SENEGAL_BOUNDS.maxLng
  );
}

export function buildRouteGraph(rows: RouteGraphRow[]): RouteGraph {
  const stops = new Map<string, GraphStop>();
  const rideEdges = new Map<string, RideEdge[]>();
  const walkEdges = new Map<string, WalkEdge[]>();

  const byLine = new Map<string, RouteGraphRow[]>();
  for (const row of rows) {
    if (!hasValidCoordinates(row.latitude, row.longitude)) continue;
    stops.set(row.stop_id, {
      id: row.stop_id,
      name: row.stop_name,
      latitude: row.latitude,
      longitude: row.longitude,
    });
    const list = byLine.get(row.line_id);
    if (list) list.push(row);
    else byLine.set(row.line_id, [row]);
  }

  const lineStops = new Map<string, string[]>();
  for (const [lineId, lineRows] of byLine) {
    lineRows.sort((a, b) => a.sequence - b.sequence);
    lineStops.set(lineId, lineRows.map((r) => r.stop_id));
    for (let i = 0; i < lineRows.length - 1; i++) {
      const a = lineRows[i];
      const b = lineRows[i + 1];
      const km = distanceKm(a.latitude, a.longitude, b.latitude, b.longitude);
      // Fractionnaire : arrondir chaque tronçon à la minute gonflerait les
      // longues lignes aux arrêts rapprochés. L'arrondi se fait par étape.
      const minutes = rideMinutes(km, a.operator_short_name);
      const base = {
        kind: 'ride' as const,
        minutes,
        lineId: a.line_id,
        lineCode: a.line_code,
        lineName: a.line_name,
        lineColor: a.line_color || a.operator_color,
        operatorShortName: a.operator_short_name,
        fareFcfa: a.fare_fcfa,
      };
      addEdge(rideEdges, a.stop_id, { ...base, toStopId: b.stop_id });
      addEdge(rideEdges, b.stop_id, { ...base, toStopId: a.stop_id });
    }
  }

  const stopList = Array.from(stops.values());
  for (let i = 0; i < stopList.length; i++) {
    for (let j = i + 1; j < stopList.length; j++) {
      const a = stopList[i];
      const b = stopList[j];
      const km = distanceKm(a.latitude, a.longitude, b.latitude, b.longitude);
      if (km <= WALK_TRANSFER_RADIUS_KM) {
        const minutes = Math.max(1, Math.round((km / WALK_SPEED_KMH) * 60));
        addEdge(walkEdges, a.id, { kind: 'walk', toStopId: b.id, minutes });
        addEdge(walkEdges, b.id, { kind: 'walk', toStopId: a.id, minutes });
      }
    }
  }

  return { stops, rideEdges, walkEdges, lineStops };
}

type PathEdge = (RideEdge | WalkEdge) & { fromStopId: string };

function stateKey(stopId: string, lineId: string | null) {
  return `${stopId}::${lineId ?? ''}`;
}

// Dijkstra sur un espace d'états (arrêt, ligne actuellement empruntée) pour
// facturer l'attente d'une nouvelle ligne une seule fois par correspondance,
// pas à chaque arrêt intermédiaire.
function findShortestPath(
  graph: RouteGraph,
  originStopId: string,
  destinationStopId: string,
  excludeLineIds?: Set<string>
): PathEdge[] | null {
  if (originStopId === destinationStopId) return [];

  const dist = new Map<string, number>();
  const prev = new Map<string, { key: string; edge: PathEdge }>();
  const visited = new Set<string>();

  const startKey = stateKey(originStopId, null);
  dist.set(startKey, 0);

  // File de priorité simple (le réseau reste petit — quelques dizaines
  // d'arrêts — donc une recherche linéaire du minimum est amplement assez
  // rapide, sans dépendance externe).
  const queue = new Set<string>([startKey]);

  while (queue.size > 0) {
    let currentKey: string | null = null;
    let currentDist = Infinity;
    for (const key of queue) {
      const d = dist.get(key)!;
      if (d < currentDist) {
        currentDist = d;
        currentKey = key;
      }
    }
    if (currentKey === null) break;
    queue.delete(currentKey);
    if (visited.has(currentKey)) continue;
    visited.add(currentKey);

    const [stopId, lineId] = currentKey.split('::');
    const currentLineId = lineId || null;

    if (stopId === destinationStopId) {
      const path: PathEdge[] = [];
      let key: string | undefined = currentKey;
      while (key && key !== startKey) {
        const step = prev.get(key);
        if (!step) break;
        path.unshift(step.edge);
        key = step.key;
      }
      return path;
    }

    for (const edge of graph.rideEdges.get(stopId) ?? []) {
      if (excludeLineIds?.has(edge.lineId)) continue;
      const boarding = currentLineId !== edge.lineId;
      const wait = boarding ? waitMinutes(edge.operatorShortName) : 0;
      // `dist` est un coût (temps + pénalité de montée), pas une durée : la
      // durée réelle reste celle portée par l'arête.
      const newDist = currentDist + edge.minutes + wait + (boarding ? BOARDING_PENALTY_MINUTES : 0);
      const newKey = stateKey(edge.toStopId, edge.lineId);
      if (newDist < (dist.get(newKey) ?? Infinity)) {
        dist.set(newKey, newDist);
        prev.set(newKey, { key: currentKey, edge: { ...edge, minutes: edge.minutes + wait, fromStopId: stopId } });
        queue.add(newKey);
      }
    }

    for (const edge of graph.walkEdges.get(stopId) ?? []) {
      const newDist = currentDist + edge.minutes;
      const newKey = stateKey(edge.toStopId, null);
      if (newDist < (dist.get(newKey) ?? Infinity)) {
        dist.set(newKey, newDist);
        prev.set(newKey, { key: currentKey, edge: { ...edge, fromStopId: stopId } });
        queue.add(newKey);
      }
    }
  }

  return null;
}

// Ne devrait jamais arriver (tout `stopId` référencé par une arête vient du
// même graphe) : si ça arrivait quand même suite à un bug, mieux vaut
// retomber sur le centre de Dakar — un point qui passe presque inaperçu sur
// la carte — que sur (0, 0), en pleine mer au large du Ghana.
function coordOf(graph: RouteGraph, stopId: string) {
  const stop = graph.stops.get(stopId);
  return {
    latitude: stop?.latitude ?? 14.6928,
    longitude: stop?.longitude ?? -17.4467,
  };
}

function stopRefOf(graph: RouteGraph, stopId: string): StopRef {
  return { id: stopId, name: graph.stops.get(stopId)?.name ?? '', ...coordOf(graph, stopId) };
}

// Terminus vers lequel roule le bus entre deux arrêts de sa ligne.
function headsignOf(graph: RouteGraph, lineId: string, fromStopId: string, toStopId: string) {
  const order = graph.lineStops.get(lineId);
  if (!order) return undefined;
  const from = order.indexOf(fromStopId);
  const to = order.indexOf(toStopId);
  if (from < 0 || to < 0 || from === to) return undefined;
  const terminusId = to > from ? order[order.length - 1] : order[0];
  return graph.stops.get(terminusId)?.name;
}

function segmentsFromPath(graph: RouteGraph, path: PathEdge[]): TripSegment[] {
  const segments: TripSegment[] = [];

  for (const edge of path) {
    const last = segments[segments.length - 1];

    if (edge.kind === 'ride') {
      if (last?.type === 'ride' && last.lineId === edge.lineId) {
        last.alightStopId = edge.toStopId;
        last.alightStopName = graph.stops.get(edge.toStopId)?.name ?? '';
        last.stopsCount += 1;
        last.minutes += edge.minutes;
        last.path.push(coordOf(graph, edge.toStopId));
        last.stops?.push(stopRefOf(graph, edge.toStopId));
        continue;
      }
      segments.push({
        type: 'ride',
        lineId: edge.lineId,
        lineCode: edge.lineCode,
        lineName: edge.lineName,
        lineColor: edge.lineColor,
        operatorShortName: edge.operatorShortName,
        fareFcfa: edge.fareFcfa,
        boardStopId: edge.fromStopId,
        boardStopName: graph.stops.get(edge.fromStopId)?.name ?? '',
        alightStopId: edge.toStopId,
        alightStopName: graph.stops.get(edge.toStopId)?.name ?? '',
        stopsCount: 1,
        minutes: edge.minutes,
        path: [coordOf(graph, edge.fromStopId), coordOf(graph, edge.toStopId)],
        stops: [stopRefOf(graph, edge.fromStopId), stopRefOf(graph, edge.toStopId)],
      });
    } else {
      if (last?.type === 'walk') {
        last.toStopId = edge.toStopId;
        last.toStopName = graph.stops.get(edge.toStopId)?.name ?? '';
        last.minutes += edge.minutes;
        last.path.push(coordOf(graph, edge.toStopId));
        continue;
      }
      segments.push({
        type: 'walk',
        fromStopId: edge.fromStopId,
        fromStopName: graph.stops.get(edge.fromStopId)?.name ?? '',
        toStopId: edge.toStopId,
        toStopName: graph.stops.get(edge.toStopId)?.name ?? '',
        minutes: edge.minutes,
        path: [coordOf(graph, edge.fromStopId), coordOf(graph, edge.toStopId)],
      });
    }
  }

  // Les durées des tronçons sont fractionnaires : on arrondit une fois par
  // étape, au moins une minute, pour que les durées affichées tombent juste.
  for (const segment of segments) {
    segment.minutes = Math.max(1, Math.round(segment.minutes));
    if (segment.type === 'ride') {
      segment.headsign = headsignOf(graph, segment.lineId, segment.boardStopId, segment.alightStopId);
    }
  }

  return segments;
}

// Calcule le meilleur itinéraire (le plus rapide) entre deux arrêts connus.
// Renvoie `null` si aucun chemin n'existe entre les deux dans le réseau
// actuel (arrêts non reliés, même indirectement).
export function planTrip(
  graph: RouteGraph,
  originStopId: string,
  destinationStopId: string,
  excludeLineIds?: Set<string>
): TripPlan | null {
  const path = findShortestPath(graph, originStopId, destinationStopId, excludeLineIds);
  if (path === null) return null;
  if (path.length === 0) return { totalMinutes: 0, totalFareFcfa: 0, totalWalkMinutes: 0, segments: [] };

  const segments = segmentsFromPath(graph, path);
  const totalMinutes = segments.reduce((sum, s) => sum + s.minutes, 0);
  const totalFareFcfa = segments
    .filter((s): s is Extract<TripSegment, { type: 'ride' }> => s.type === 'ride')
    .reduce((sum, s) => sum + s.fareFcfa, 0);
  const totalWalkMinutes = segments
    .filter((s): s is Extract<TripSegment, { type: 'walk' }> => s.type === 'walk')
    .reduce((sum, s) => sum + s.minutes, 0);

  return { totalMinutes, totalFareFcfa, totalWalkMinutes, segments };
}

// Ajoute la marche réelle depuis la position GPS de l'utilisateur jusqu'à
// l'arrêt où il monte. Sans ça le trajet démarre à l'arrêt, comme si
// l'utilisateur y était déjà téléporté : le temps annoncé était donc
// systématiquement sous-estimé.
// Deux marches qui se suivent — l'approche jusqu'à un arrêt, puis une marche
// de correspondance qui en repart — n'en font qu'une : passer par l'arrêt
// serait un détour. On marche directement du premier point au dernier (c'est
// le cas d'une option « tout à pied »).
function mergeConsecutiveWalks(plan: TripPlan): TripPlan {
  const segments: TripSegment[] = [];
  for (const segment of plan.segments) {
    const previous = segments[segments.length - 1];
    if (segment.type === 'walk' && previous?.type === 'walk') {
      const from = previous.path[0];
      const to = segment.path[segment.path.length - 1];
      const km = distanceKm(from.latitude, from.longitude, to.latitude, to.longitude);
      segments[segments.length - 1] = {
        ...previous,
        toStopId: segment.toStopId,
        toStopName: segment.toStopName,
        minutes: Math.max(1, Math.round((km / WALK_SPEED_KMH) * 60)),
        path: [from, to],
      };
    } else {
      segments.push(segment);
    }
  }
  if (segments.length === plan.segments.length) return plan;

  const walkMinutes = (list: TripSegment[]) =>
    list.reduce((sum, s) => sum + (s.type === 'walk' ? s.minutes : 0), 0);
  const saved = walkMinutes(plan.segments) - walkMinutes(segments);
  return {
    ...plan,
    segments,
    totalMinutes: plan.totalMinutes - saved,
    totalWalkMinutes: plan.totalWalkMinutes - saved,
  };
}

export function withAccessWalk(plan: TripPlan, from: LatLng, boardingStop: Stop): TripPlan {
  const km = distanceKm(from.latitude, from.longitude, boardingStop.latitude, boardingStop.longitude);
  if (km < MIN_ACCESS_WALK_KM) return plan;

  const minutes = Math.max(1, Math.round((km / WALK_SPEED_KMH) * 60));
  const walk: TripSegment = {
    type: 'walk',
    fromStopId: USER_POSITION_ID,
    fromStopName: 'Ma position',
    toStopId: boardingStop.id,
    toStopName: boardingStop.name,
    minutes,
    path: [
      { latitude: from.latitude, longitude: from.longitude },
      { latitude: boardingStop.latitude, longitude: boardingStop.longitude },
    ],
  };

  return mergeConsecutiveWalks({
    ...plan,
    totalMinutes: plan.totalMinutes + minutes,
    totalWalkMinutes: plan.totalWalkMinutes + minutes,
    segments: [walk, ...plan.segments],
  });
}

// Ajoute la marche finale entre l'arrêt où l'on descend et le lieu visé
// (mairie, hôpital, marché…), qui n'est pas lui-même un arrêt du réseau.
export function withEgressWalk(plan: TripPlan, alightStop: Stop, place: LatLng & { id: string; name: string }): TripPlan {
  const km = distanceKm(alightStop.latitude, alightStop.longitude, place.latitude, place.longitude);
  if (km < MIN_ACCESS_WALK_KM) return plan;

  const minutes = Math.max(1, Math.round((km / WALK_SPEED_KMH) * 60));
  const walk: TripSegment = {
    type: 'walk',
    fromStopId: alightStop.id,
    fromStopName: alightStop.name,
    toStopId: place.id,
    toStopName: place.name,
    minutes,
    path: [
      { latitude: alightStop.latitude, longitude: alightStop.longitude },
      { latitude: place.latitude, longitude: place.longitude },
    ],
  };

  return mergeConsecutiveWalks({
    ...plan,
    totalMinutes: plan.totalMinutes + minutes,
    totalWalkMinutes: plan.totalWalkMinutes + minutes,
    segments: [...plan.segments, walk],
  });
}

/**
 * Garde les deux meilleurs trajets parmi plusieurs candidats, en ne retenant
 * qu'un trajet par combinaison de lignes (deux trajets qui prennent les mêmes
 * lignes ne sont pas un vrai choix).
 */
export function pickBestOptions(plans: TripPlan[]): TripOption[] {
  const sorted = [...plans].sort((a, b) => a.totalMinutes - b.totalMinutes);
  const seen = new Set<string>();
  const unique: TripPlan[] = [];
  for (const plan of sorted) {
    const key = rideSignature(plan);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(plan);
    if (unique.length === 2) break;
  }
  return unique.map((plan, i) => ({ plan, recommended: i === 0 }));
}

// Nombre d'arrêts de départ comparés quand on part de la position réelle.
const MAX_ORIGIN_CANDIDATES = 5;

function rideSignature(plan: TripPlan): string {
  return plan.segments
    .filter((s): s is Extract<TripSegment, { type: 'ride' }> => s.type === 'ride')
    .map((s) => s.lineId)
    .join('>');
}

/**
 * Planifie un trajet qui part de la position GPS de l'utilisateur.
 *
 * L'arrêt le plus proche à vol d'oiseau n'est pas forcément le bon : il peut
 * n'être desservi par aucune ligne utile, alors qu'un arrêt 300 m plus loin
 * mène directement à destination. On compare donc plusieurs arrêts
 * accessibles à pied — marche comprise — et on garde les meilleurs trajets,
 * comme le font les applications de navigation.
 *
 * `candidates` doit être trié par distance croissante (c'est l'ordre renvoyé
 * par `nearby_stops`).
 */
export function planFromPosition(
  graph: RouteGraph,
  from: LatLng,
  candidates: Stop[],
  destinationStopId: string
): TripOption[] {
  const all: TripPlan[] = [];

  for (const stop of candidates.slice(0, MAX_ORIGIN_CANDIDATES)) {
    if (stop.id === destinationStopId) continue;
    for (const option of planTripOptions(graph, stop.id, destinationStopId)) {
      if (option.plan.segments.length === 0) continue;
      all.push(withAccessWalk(option.plan, from, stop));
    }
  }

  all.sort((a, b) => a.totalMinutes - b.totalMinutes);

  // Deux trajets qui prennent exactement les mêmes lignes ne sont pas un vrai
  // choix : on ne garde que le plus rapide de chaque combinaison.
  const seen = new Set<string>();
  const unique: TripPlan[] = [];
  for (const plan of all) {
    const key = rideSignature(plan);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(plan);
    if (unique.length === 2) break;
  }

  return unique.map((plan, i) => ({ plan, recommended: i === 0 }));
}

// Calcule jusqu'à deux options de trajet, pour l'écran "Choisir un trajet" :
// la plus rapide (recommandée), puis — si le réseau le permet — une
// alternative obtenue en excluant la ligne principale du premier trajet
// (donc forcément différente), pour donner un vrai choix plutôt qu'une
// simple confirmation.
export function planTripOptions(
  graph: RouteGraph,
  originStopId: string,
  destinationStopId: string
): TripOption[] {
  const best = planTrip(graph, originStopId, destinationStopId);
  if (best === null || best.segments.length === 0) {
    return best ? [{ plan: best, recommended: true }] : [];
  }

  const rideSegments = best.segments.filter(
    (s): s is Extract<TripSegment, { type: 'ride' }> => s.type === 'ride'
  );
  const mainLine = rideSegments.reduce(
    (longest, s) => (s.minutes > longest.minutes ? s : longest),
    rideSegments[0]
  );

  const options: TripOption[] = [{ plan: best, recommended: true }];

  if (mainLine) {
    const alt = planTrip(graph, originStopId, destinationStopId, new Set([mainLine.lineId]));
    const altMainLine = alt?.segments.find(
      (s): s is Extract<TripSegment, { type: 'ride' }> => s.type === 'ride' && s.lineId !== mainLine.lineId
    );
    if (alt && alt.segments.length > 0 && altMainLine) {
      options.push({ plan: alt, recommended: false });
    }
  }

  return options;
}
