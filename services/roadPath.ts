import { LatLng, TripPlan, TripSegment } from '../types/transit';

// Les segments du planificateur relient les arrêts en ligne droite : c'est
// suffisant pour calculer un trajet, mais à l'écran le tracé couperait à
// travers les immeubles. Ici, on le fait suivre les vraies rues de Dakar
// avec le moteur de routage d'OpenStreetMap (données © contributeurs OSM,
// ODbL). Si le service est injoignable, on garde la ligne droite : le
// guidage marche toujours, il est simplement moins précis visuellement.
const ENDPOINTS = {
  // Un bus roule sur les routes carrossables…
  ride: 'https://routing.openstreetmap.de/routed-car/route/v1/driving',
  // …et à pied on emprunte aussi les trottoirs et les passages piétons.
  walk: 'https://routing.openstreetmap.de/routed-foot/route/v1/driving',
} as const;

const REQUEST_TIMEOUT_MS = 8000;
// Limite prudente de points de passage par requête.
const MAX_WAYPOINTS = 25;

const cache = new Map<string, LatLng[]>();

function keyOf(profile: 'ride' | 'walk', points: LatLng[]): string {
  return profile + ':' + points.map((p) => `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`).join(';');
}

async function fetchRoad(profile: 'ride' | 'walk', points: LatLng[]): Promise<LatLng[] | null> {
  const coords = points.map((p) => `${p.longitude},${p.latitude}`).join(';');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${ENDPOINTS[profile]}/${coords}?overview=full&geometries=geojson`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = await res.json();
    const line: [number, number][] | undefined = json?.routes?.[0]?.geometry?.coordinates;
    if (json?.code !== 'Ok' || !line || line.length < 2) return null;
    return line.map(([longitude, latitude]) => ({ latitude, longitude }));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function snapPath(profile: 'ride' | 'walk', path: LatLng[]): Promise<LatLng[]> {
  if (path.length < 2) return path;
  const key = keyOf(profile, path);
  const hit = cache.get(key);
  if (hit) return hit;

  // Découpe les longues lignes en tronçons qui se recouvrent d'un point.
  const chunks: LatLng[][] = [];
  for (let i = 0; i < path.length - 1; i += MAX_WAYPOINTS - 1) {
    chunks.push(path.slice(i, i + MAX_WAYPOINTS));
  }
  const results = await Promise.all(chunks.map((chunk) => fetchRoad(profile, chunk)));
  // Si un seul tronçon échoue, on garde toute la ligne droite plutôt qu'un
  // tracé à moitié recollé.
  if (results.some((r) => r === null)) return path;

  const snapped = (results as LatLng[][]).flat();
  cache.set(key, snapped);
  return snapped;
}

export async function snapPlanToRoads(plan: TripPlan): Promise<TripPlan> {
  const segments: TripSegment[] = await Promise.all(
    plan.segments.map(async (segment) => ({
      ...segment,
      path: await snapPath(segment.type === 'ride' ? 'ride' : 'walk', segment.path),
    }))
  );
  return { ...plan, segments };
}
