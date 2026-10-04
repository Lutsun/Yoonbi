// Assistant de navigation — l'état du guidage, recalculé à chaque nouvelle
// position GPS.
//
// Tout est regroupé ici, en fonctions pures : l'écran se contente d'afficher
// ce que `computeNavigation` renvoie. C'est ce qui permet de raisonner sur le
// guidage (avancement des étapes, distance restante, sortie d'itinéraire)
// sans avoir à manipuler la carte — et de le tester sur des trajets simulés.

import { LatLng, Maneuver, ManeuverKind, TripPlan, TripSegment } from '../types/transit';
import { metersBetween, pathLengthM, projectOnPath } from './geometry';

export { metersBetween, pathLengthM, distanceToPathM } from './geometry';

// Une étape est considérée franchie près de son point d'arrivée. Le rayon
// suit la précision annoncée par le téléphone : fixe à 45 m, il échouait en
// ville dense, où le GPS dérive souvent de 50 à 80 m entre les immeubles.
const STEP_REACHED_MIN_M = 45;
const STEP_REACHED_MAX_M = 100;
// Arrivée finale — un peu plus large, on veut annoncer l'arrivée avant que
// l'utilisateur soit littéralement sur le panneau.
const DESTINATION_REACHED_MIN_M = 70;
// Au-delà, on considère que l'utilisateur n'est plus sur l'itinéraire.
const OFF_ROUTE_M = 300;
// Un fix moins précis que ça ne permet pas de décider quoi que ce soit : on
// garde l'étape en cours plutôt que d'avancer sur une position douteuse.
const UNRELIABLE_ACCURACY_M = 150;
// Rattrapage : si l'utilisateur est nettement plus près d'une étape suivante
// que de l'étape en cours, c'est qu'un fix a manqué le point de passage
// (fréquent en bus, qui franchit 50 m entre deux positions).
const LOOKAHEAD_NEAR_M = 40;
const LOOKAHEAD_MARGIN_M = 25;
// Assez près du tracé pour mesurer la distance restante le long de lui
// plutôt qu'à vol d'oiseau.
const ON_PATH_M = 60;
// Tant que l'utilisateur n'a pas quitté l'arrêt de montée, il attend son bus.
const BOARDING_ZONE_M = 40;
// Un arrêt (ou un virage) est derrière l'utilisateur une fois dépassé de ça.
const PASSED_STOP_M = 15;
const PASSED_MANEUVER_M = 8;
// Recul toléré le long du tracé : le GPS qui oscille de quelques mètres ne
// doit ni faire « reculer » le trajet parcouru, ni le figer.
const BACKTRACK_M = 40;

const WALK_SPEED_KMH = 4.5;

export type NavigationStep = {
  // `kind` reste sémantique : c'est l'écran qui choisit l'icône.
  kind: 'walk' | 'board' | 'ride' | 'arrival';
  title: string;
  detail: string;
  lineCode?: string;
  lineColor?: string;
  /** À pied : le geste à faire (flèche à afficher). */
  maneuver?: ManeuverKind;
};

export type NavigationState = {
  /** Étape en cours ; égal à `segments.length` une fois arrivé. */
  stepIndex: number;
  arrived: boolean;
  offRoute: boolean;
  /** Vrai quand le GPS est trop imprécis pour faire avancer le guidage. */
  weakSignal: boolean;
  /** Distance jusqu'au point d'arrivée de l'étape en cours, le long du trajet. */
  distanceToNextM: number;
  /**
   * Mètres déjà parcourus le long du tracé de l'étape en cours — ne recule
   * jamais. C'est là que la carte sépare le chemin fait (grisé) du reste.
   */
  alongM: number;
  remainingMinutes: number;
  remainingMeters: number;
  /** Avancement sur l'ensemble du trajet, entre 0 et 1. */
  progress: number;
  instruction: NavigationStep;
  /** En bus : le prochain arrêt où le bus va s'arrêter. */
  nextStopName?: string;
  /** En bus : nombre d'arrêts restants, celui de descente compris. */
  stopsRemaining?: number;
};

export function formatMeters(m: number): string {
  if (!isFinite(m)) return '—';
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}

function endOf(segment: TripSegment): LatLng {
  return segment.path[segment.path.length - 1];
}

// Positions le long du tracé des arrêts (en bus) et des virages (à pied),
// calculées une fois par tracé plutôt qu'à chaque position GPS. La clé est le
// couple (tracé, points) : quand le tracé est remplacé (rues suivies, ou
// recalcul), les positions sont recalculées sur le nouveau.
const alongCache = new WeakMap<LatLng[], WeakMap<object, number[]>>();

function alongsOf(path: LatLng[], points: LatLng[]): number[] {
  let byPoints = alongCache.get(path);
  if (!byPoints) {
    byPoints = new WeakMap();
    alongCache.set(path, byPoints);
  }
  const hit = byPoints.get(points);
  if (hit) return hit;

  const alongs: number[] = [];
  let from = 0;
  for (const point of points) {
    // Chaque point est cherché après le précédent : les arrêts et virages se
    // succèdent dans l'ordre du trajet.
    const along = projectOnPath(point, path, from).along;
    alongs.push(along);
    from = along;
  }
  byPoints.set(points, alongs);
  return alongs;
}

type Instruction = Pick<NavigationState, 'instruction' | 'nextStopName' | 'stopsRemaining'>;

function rideInstruction(
  segment: Extract<TripSegment, { type: 'ride' }>,
  userAlong: number,
  distanceToNextM: number
): Instruction {
  const base = { lineCode: segment.lineCode, lineColor: segment.lineColor };
  const stops = segment.stops;

  // Anciens trajets en cache, sans la liste des arrêts traversés.
  if (!stops || stops.length < 2) {
    return {
      instruction: {
        ...base,
        kind: 'ride',
        title: `Descendez à ${segment.alightStopName}`,
        detail:
          distanceToNextM > 900
            ? `Restez dans le bus · ${formatMeters(distanceToNextM)}`
            : `Préparez-vous · ${formatMeters(distanceToNextM)}`,
      },
    };
  }

  // Encore à l'arrêt de montée : il faut d'abord prendre le bon bus.
  if (userAlong < BOARDING_ZONE_M) {
    return {
      instruction: {
        ...base,
        kind: 'board',
        title: `Prenez la ${segment.lineCode}`,
        detail: segment.headsign
          ? `Direction ${segment.headsign} · descendez à ${segment.alightStopName}`
          : `Descendez à ${segment.alightStopName}`,
      },
      nextStopName: stops[1].name,
      stopsRemaining: stops.length - 1,
    };
  }

  const alongs = alongsOf(segment.path, stops);
  let next = alongs.findIndex((a, i) => i > 0 && a > userAlong + PASSED_STOP_M);
  if (next < 0) next = stops.length - 1;
  const stopsRemaining = stops.length - next;

  if (stopsRemaining <= 1) {
    return {
      instruction: {
        ...base,
        kind: 'ride',
        title: 'Descendez au prochain arrêt',
        detail: `${segment.alightStopName} · ${formatMeters(distanceToNextM)}`,
      },
      nextStopName: segment.alightStopName,
      stopsRemaining: 1,
    };
  }

  return {
    instruction: {
      ...base,
      kind: 'ride',
      title: `Descendez à ${segment.alightStopName}`,
      // Le décompte d'abord : un nom d'arrêt long ne doit pas le faire couper.
      detail: `Encore ${stopsRemaining} arrêts · prochain : ${stops[next].name}`,
    },
    nextStopName: stops[next].name,
    stopsRemaining,
  };
}

function walkInstruction(
  segment: Extract<TripSegment, { type: 'walk' }>,
  targetName: string,
  userAlong: number,
  distanceToNextM: number
): Instruction {
  const fallback: Instruction = {
    instruction: {
      kind: 'walk',
      title: `Marchez jusqu’à ${targetName}`,
      detail: formatMeters(distanceToNextM),
    },
  };

  const maneuvers = segment.maneuvers ?? [];
  if (!maneuvers.some((m) => m.kind !== 'depart' && m.kind !== 'arrive')) return fallback;

  const alongs = alongsOf(segment.path, maneuvers);

  // Au tout début, la consigne de départ indique dans quelle rue partir.
  if (userAlong < 20 && maneuvers[0].kind === 'depart') {
    return {
      instruction: {
        kind: 'walk',
        maneuver: 'depart',
        title: maneuvers[0].text,
        detail: `Vers ${targetName} · ${formatMeters(distanceToNextM)}`,
      },
    };
  }

  const index = maneuvers.findIndex(
    (m: Maneuver, i) =>
      m.kind !== 'depart' && m.kind !== 'arrive' && alongs[i] > userAlong + PASSED_MANEUVER_M
  );
  if (index < 0) return fallback;

  const toManeuver = alongs[index] - userAlong;
  // Le virage est au-delà de la fin de l'étape (cas d'un tracé recalé) :
  // la consigne utile reste de rejoindre l'arrêt.
  if (toManeuver >= distanceToNextM) return fallback;

  return {
    instruction: {
      kind: 'walk',
      maneuver: maneuvers[index].kind,
      title: maneuvers[index].text,
      detail: `Dans ${formatMeters(toManeuver)} · vers ${targetName}`,
    },
  };
}

function arrivedState(stepIndex: number, destinationName: string): NavigationState {
  return {
    stepIndex,
    arrived: true,
    offRoute: false,
    weakSignal: false,
    distanceToNextM: 0,
    alongM: 0,
    remainingMinutes: 0,
    remainingMeters: 0,
    progress: 1,
    instruction: { kind: 'arrival', title: 'Vous êtes arrivé', detail: destinationName },
  };
}

/**
 * Recalcule l'état du guidage pour une position donnée.
 *
 * `previousStepIndex` rend l'avancement monotone : une fois une étape
 * franchie on ne revient pas en arrière, même si le GPS fait un écart ou si
 * l'itinéraire repasse près d'un point déjà parcouru.
 *
 * `accuracyM` est le rayon d'incertitude annoncé par le téléphone pour cette
 * position : il élargit les seuils quand le signal est médiocre, et bloque
 * l'avancement quand il est trop mauvais pour être fiable.
 *
 * `previousAlongM` est l'avancement déjà atteint sur l'étape
 * `previousStepIndex` (le `alongM` de l'état précédent) : il rend le chemin
 * parcouru monotone, et garde la progression pendant un détour du bus.
 *
 * `destination` est le nom de la destination, ou la destination elle-même
 * (nom et position) : l'arrivée est alors aussi reconnue près d'elle — un
 * arrêt enregistré à l'écart de la route n'est pas là où le tracé s'arrête,
 * et l'utilisateur déposé autrement (taxi, à pied) doit aussi être « arrivé ».
 */
export function computeNavigation(
  plan: TripPlan,
  user: LatLng,
  destination: string | (LatLng & { name: string }),
  previousStepIndex: number,
  accuracyM: number | null = null,
  previousAlongM = 0
): NavigationState {
  const segments = plan.segments;
  const destinationName = typeof destination === 'string' ? destination : destination.name;
  if (segments.length === 0) return arrivedState(0, destinationName);

  const accuracy = accuracyM ?? STEP_REACHED_MIN_M;
  const weakSignal = accuracy > UNRELIABLE_ACCURACY_M;
  const stepRadius = Math.min(STEP_REACHED_MAX_M, Math.max(STEP_REACHED_MIN_M, accuracy));
  const destinationRadius = Math.max(DESTINATION_REACHED_MIN_M, stepRadius);

  const lengths = segments.map((s) => pathLengthM(s.path));
  const totalMeters = lengths.reduce((sum, l) => sum + l, 0);
  const routeEnd = endOf(segments[segments.length - 1]);

  // Arrivée — on ne la déclare jamais sur une position douteuse.
  const atDestination =
    metersBetween(user, routeEnd) <= destinationRadius ||
    (typeof destination !== 'string' && metersBetween(user, destination) <= destinationRadius);
  if (!weakSignal && atDestination) {
    return arrivedState(segments.length, destinationName);
  }

  let index = Math.min(Math.max(0, previousStepIndex), segments.length - 1);

  if (!weakSignal) {
    // 1. Avance tant que le point d'arrivée de l'étape courante est atteint.
    while (index < segments.length && metersBetween(user, endOf(segments[index])) <= stepRadius) {
      index += 1;
    }

    // 2. Rattrapage d'un point de passage manqué entre deux positions. On
    //    retient l'étape suivante la PLUS PROCHE qui convient : sur un trajet
    //    qui repasse près de son départ, prendre la plus lointaine ferait
    //    sauter toute la fin d'un coup.
    if (index < segments.length) {
      const toCurrent = projectOnPath(user, segments[index].path).distance;
      for (let j = index + 1; j < segments.length; j++) {
        const toLater = projectOnPath(user, segments[j].path).distance;
        if (toLater <= LOOKAHEAD_NEAR_M && toLater + LOOKAHEAD_MARGIN_M < toCurrent) {
          index = j;
          break;
        }
      }
    }
  }

  if (index >= segments.length) return arrivedState(segments.length, destinationName);

  const current = segments[index];
  const currentLength = lengths[index];
  // Avancement acquis sur cette étape (rien si on vient de l'atteindre). La
  // projection ne cherche pas avant : sur un tracé qui repasse par la même
  // avenue, l'utilisateur ne doit pas être renvoyé au passage précédent.
  const carried = index === previousStepIndex ? Math.min(previousAlongM, currentLength) : 0;
  const projection = projectOnPath(user, current.path, Math.max(0, carried - BACKTRACK_M));
  const onPath = projection.distance <= ON_PATH_M + Math.min(accuracy, STEP_REACHED_MAX_M);
  // Une position douteuse ne fait pas avancer le chemin parcouru.
  const along = onPath && !weakSignal ? Math.max(carried, projection.along) : carried;

  // Restant sur l'étape : le long du tracé quand l'utilisateur est dessus —
  // un bus qui contourne un pâté de maisons n'est pas « à 200 m » de l'arrêt
  // de l'autre côté — sinon à vol d'oiseau.
  const distanceToNextM = onPath
    ? Math.max(0, currentLength - along)
    : metersBetween(user, endOf(current));
  // Hors du tracé (bus en détour), on garde l'avancement acquis : le décompte
  // des arrêts ne repart pas à zéro.
  const userAlong = along;

  // Bus en détour : la distance à vol d'oiseau jusqu'à l'arrêt sous-estime
  // ce qui reste (le bus va rejoindre son trajet) — on garde au moins le
  // reste du trajet habituel, pour que le temps restant ne s'effondre pas.
  const stepRemaining =
    !onPath && current.type === 'ride'
      ? Math.max(distanceToNextM, currentLength - carried)
      : distanceToNextM;
  const laterMeters = lengths.slice(index + 1).reduce((sum, l) => sum + l, 0);
  const remainingMeters = Math.min(stepRemaining, currentLength) + laterMeters;

  const currentFraction = currentLength > 0 ? Math.min(1, stepRemaining / currentLength) : 0;
  const remainingMinutes = Math.max(
    1,
    Math.round(
      current.minutes * currentFraction +
        segments.slice(index + 1).reduce((sum, s) => sum + s.minutes, 0)
    )
  );

  // Hors itinéraire : loin de l'étape en cours ET de la suivante — sans ça,
  // chaque passage d'une étape à l'autre déclenchait une fausse alerte.
  const next = segments[index + 1];
  const toRoute = Math.min(
    projection.distance,
    next ? projectOnPath(user, next.path).distance : Infinity
  );
  const offRoute = !weakSignal && toRoute > OFF_ROUTE_M + accuracy;

  const isLast = index === segments.length - 1;
  const guidance =
    current.type === 'ride'
      ? rideInstruction(current, userAlong, distanceToNextM)
      : walkInstruction(current, isLast ? destinationName : current.toStopName, userAlong, distanceToNextM);

  return {
    stepIndex: index,
    arrived: false,
    offRoute,
    weakSignal,
    distanceToNextM,
    alongM: along,
    remainingMinutes,
    remainingMeters,
    progress: totalMeters > 0 ? Math.max(0, Math.min(1, 1 - remainingMeters / totalMeters)) : 0,
    ...guidance,
  };
}

// --- Recalcul d'itinéraire ----------------------------------------------------
// Écart durable avant de recalculer le chemin à pied (un GPS qui saute une
// fois ne doit rien déclencher).
const WALK_REROUTE_AFTER_MS = 8000;
// Au-delà, revenir à pied jusqu'à l'arrêt visé n'a plus de sens (arrêt de
// descente manqué, bus parti ailleurs) : on recalcule le trajet entier.
const WALK_BACK_MAX_M = 1500;
// En bus, un détour (travaux, embouteillage) n'est pas une erreur : on ne
// recalcule que si le bus s'éloigne de l'arrêt de descente de plus de
// RIDE_DRIFT_M depuis le début de l'écart, pendant au moins
// RIDE_REROUTE_AFTER_MS — mauvais bus, ou ligne qui a changé de parcours.
const RIDE_REROUTE_AFTER_MS = 45000;
const RIDE_DRIFT_M = 250;
// À l'arrêt de montée, s'en éloigner hors du tracé de la ligne veut dire
// qu'on a pris le mauvais bus ou qu'on est parti à pied ailleurs.
const BOARD_REROUTE_AFTER_MS = 20000;

export type RerouteDecision =
  | { action: 'none' }
  /** Recalculer seulement le chemin à pied jusqu'au point visé. */
  | { action: 'walk' }
  /** Recalculer le trajet entier depuis la position actuelle. */
  | { action: 'replan'; reason: string };

/**
 * Faut-il recalculer, et quoi ? `offRouteForMs` est la durée de l'écart en
 * cours, `driftM` de combien la distance au point visé a augmenté depuis son
 * début (négatif si l'utilisateur s'en rapproche malgré tout).
 */
export function rerouteDecision(
  state: NavigationState,
  segmentType: TripSegment['type'],
  offRouteForMs: number,
  driftM: number
): RerouteDecision {
  if (!state.offRoute || state.arrived) return { action: 'none' };

  if (segmentType === 'ride') {
    if (state.instruction.kind === 'board') {
      return offRouteForMs >= BOARD_REROUTE_AFTER_MS
        ? { action: 'replan', reason: 'Vous avez quitté l’arrêt' }
        : { action: 'none' };
    }
    return offRouteForMs >= RIDE_REROUTE_AFTER_MS && driftM >= RIDE_DRIFT_M
      ? { action: 'replan', reason: 'Le bus a changé de route' }
      : { action: 'none' };
  }

  if (offRouteForMs < WALK_REROUTE_AFTER_MS) return { action: 'none' };
  return state.distanceToNextM > WALK_BACK_MAX_M
    ? { action: 'replan', reason: 'Vous êtes loin de votre chemin' }
    : { action: 'walk' };
}

// Durée de marche estimée pour une distance donnée — sert à annoncer
// « 4 min à pied » sur les étapes piétonnes en cours.
export function walkMinutesFor(meters: number): number {
  return Math.max(1, Math.round((meters / 1000 / WALK_SPEED_KMH) * 60));
}
