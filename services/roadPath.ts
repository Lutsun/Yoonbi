import { LatLng, Maneuver, ManeuverKind, TripPlan, TripSegment } from '../types/transit';
import { shapeBetweenStops } from './geometry';
import { getLineShapes } from './shapes';

// Les segments du planificateur relient les arrêts en ligne droite : c'est
// suffisant pour calculer un trajet, mais à l'écran le tracé couperait à
// travers les immeubles. Ici, on remplace chaque segment par le vrai chemin :
//
//  - en bus, le tracé réel de la ligne quand il est connu (line_shapes,
//    issu d'OpenStreetMap), sinon les rues suivies arrêt par arrêt ;
//  - à pied, le chemin piéton avec ses consignes tournant par tournant.
//
// Moteur de routage : OSRM sur les données OpenStreetMap (© contributeurs
// OSM, ODbL). Si le service est injoignable, un tronçon garde sa ligne
// droite : le guidage marche toujours, il est simplement moins précis.
const ENDPOINTS = {
  // Un bus roule sur les routes carrossables…
  ride: 'https://routing.openstreetmap.de/routed-car/route/v1/driving',
  // …et à pied on emprunte aussi les trottoirs et les passages piétons.
  walk: 'https://routing.openstreetmap.de/routed-foot/route/v1/driving',
} as const;

const REQUEST_TIMEOUT_MS = 8000;
// Limite prudente de points de passage par requête.
const MAX_WAYPOINTS = 25;

type Profile = keyof typeof ENDPOINTS;
type Routed = { path: LatLng[]; maneuvers: Maneuver[] };

const cache = new Map<string, Routed>();

function keyOf(profile: Profile, points: LatLng[]): string {
  return profile + ':' + points.map((p) => `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`).join(';');
}

// --- Consignes à pied --------------------------------------------------------

type OsrmStep = {
  name?: string;
  maneuver: { type: string; modifier?: string; exit?: number; location: [number, number] };
};

const TURNS: Record<string, { kind: ManeuverKind; verb: string }> = {
  left: { kind: 'left', verb: 'Tourne à gauche' },
  right: { kind: 'right', verb: 'Tourne à droite' },
  'slight left': { kind: 'slight-left', verb: 'Prends légèrement à gauche' },
  'slight right': { kind: 'slight-right', verb: 'Prends légèrement à droite' },
  'sharp left': { kind: 'sharp-left', verb: 'Tourne franchement à gauche' },
  'sharp right': { kind: 'sharp-right', verb: 'Tourne franchement à droite' },
  uturn: { kind: 'uturn', verb: 'Fais demi-tour' },
  straight: { kind: 'straight', verb: 'Continue tout droit' },
};

function ordinal(n: number): string {
  return n === 1 ? '1re' : `${n}e`;
}

// Traduit une étape OSRM en consigne française — ou `null` pour les étapes
// sans action réelle (la rue change juste de nom, on continue tout droit).
function maneuverFromStep(step: OsrmStep): Maneuver | null {
  const { type, modifier, exit, location } = step.maneuver;
  const at = { longitude: location[0], latitude: location[1] };
  const street = step.name?.trim();
  const onStreet = street ? ` sur ${street}` : '';

  if (type === 'depart') {
    return { ...at, kind: 'depart', text: street ? `Pars sur ${street}` : 'Commence à marcher' };
  }
  if (type === 'arrive') {
    return { ...at, kind: 'arrive', text: 'Tu es arrivé' };
  }
  if (type.includes('roundabout') || type.includes('rotary')) {
    return {
      ...at,
      kind: 'roundabout',
      text: exit ? `Au rond-point, prends la ${ordinal(exit)} sortie${onStreet}` : `Traverse le rond-point${onStreet}`,
    };
  }
  if (type === 'notification') return null;

  const turn = TURNS[modifier ?? 'straight'] ?? TURNS.straight;
  if (turn.kind === 'straight') {
    // « Continue tout droit » n'apporte rien sans nouveau nom de rue.
    if (!street || type === 'continue') return null;
    return { ...at, kind: 'straight', text: `Continue sur ${street}` };
  }
  return { ...at, kind: turn.kind, text: `${turn.verb}${onStreet}` };
}

// --- Routage ---------------------------------------------------------------

async function fetchRoute(profile: Profile, points: LatLng[]): Promise<Routed | null> {
  const coords = points.map((p) => `${p.longitude},${p.latitude}`).join(';');
  const steps = profile === 'walk' ? '&steps=true' : '';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${ENDPOINTS[profile]}/${coords}?overview=full&geometries=geojson${steps}`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = await res.json();
    const route = json?.routes?.[0];
    const line: [number, number][] | undefined = route?.geometry?.coordinates;
    if (json?.code !== 'Ok' || !line || line.length < 2) return null;

    const maneuvers: Maneuver[] = [];
    const legs: { steps?: OsrmStep[] }[] = route.legs ?? [];
    legs.forEach((leg, legIndex) => {
      for (const step of leg.steps ?? []) {
        // Les points de passage intermédiaires (arrêts traversés à pied) ne
        // sont ni des départs ni des arrivées pour l'utilisateur.
        if (step.maneuver.type === 'depart' && legIndex > 0) continue;
        if (step.maneuver.type === 'arrive' && legIndex < legs.length - 1) continue;
        const maneuver = maneuverFromStep(step);
        if (maneuver) maneuvers.push(maneuver);
      }
    });

    return { path: line.map(([longitude, latitude]) => ({ latitude, longitude })), maneuvers };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Suit les rues en passant par tous les points, dans l'ordre. Les longues
// listes sont découpées en tronçons ; un tronçon que le service n'a pas pu
// tracer garde sa ligne droite, sans sacrifier les autres.
async function routeThrough(profile: Profile, points: LatLng[]): Promise<Routed> {
  if (points.length < 2) return { path: points, maneuvers: [] };
  const key = keyOf(profile, points);
  const hit = cache.get(key);
  if (hit) return hit;

  const chunks: LatLng[][] = [];
  for (let i = 0; i < points.length - 1; i += MAX_WAYPOINTS - 1) {
    chunks.push(points.slice(i, i + MAX_WAYPOINTS));
  }
  const results = await Promise.all(chunks.map((chunk) => fetchRoute(profile, chunk)));

  const path: LatLng[] = [];
  const maneuvers: Maneuver[] = [];
  results.forEach((result, i) => {
    const part = result?.path ?? chunks[i];
    path.push(...(path.length > 0 ? part.slice(1) : part));
    if (result) maneuvers.push(...result.maneuvers);
  });

  const routed = { path, maneuvers };
  // On ne garde en cache que les tracés complets : un échec réseau ne doit
  // pas figer une ligne droite pour toute la session.
  if (results.every(Boolean)) cache.set(key, routed);
  return routed;
}

/** Chemin piéton (et ses consignes) entre deux points — sert aussi au recalcul. */
export async function walkingRoute(from: LatLng, to: LatLng): Promise<Routed | null> {
  return fetchRoute('walk', [from, to]);
}

export async function snapPlanToRoads(plan: TripPlan): Promise<TripPlan> {
  const shapes = await getLineShapes();

  const segments: TripSegment[] = await Promise.all(
    plan.segments.map(async (segment): Promise<TripSegment> => {
      if (segment.type === 'ride') {
        const stops = segment.stops && segment.stops.length >= 2 ? segment.stops : segment.path;
        const shape = shapes.get(segment.lineId);
        const exact = shape ? shapeBetweenStops(shape, stops) : null;
        return { ...segment, path: exact ?? (await routeThrough('ride', stops)).path };
      }
      const routed = await routeThrough('walk', segment.path);
      return {
        ...segment,
        path: routed.path,
        maneuvers: routed.maneuvers.length > 0 ? routed.maneuvers : segment.maneuvers,
      };
    })
  );
  return { ...plan, segments };
}
