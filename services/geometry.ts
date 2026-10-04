// Géométrie à l'échelle d'une ville : projeter un point sur un tracé, mesurer
// une longueur le long du tracé, en découper un morceau. Partagé par le
// tracé des trajets (roadPath.ts) et le guidage (navigation.ts).
//
// À l'échelle de Dakar, projeter localement les degrés en mètres est assez
// précis et évite de la trigonométrie sphérique inutile.

import { LatLng } from '../types/transit';
import { distanceKm } from '../utils/eta';

const M_PER_DEG_LAT = 111_320;

export function metersBetween(a: LatLng, b: LatLng): number {
  return distanceKm(a.latitude, a.longitude, b.latitude, b.longitude) * 1000;
}

export function pathLengthM(path: LatLng[]): number {
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) total += metersBetween(path[i], path[i + 1]);
  return total;
}

export type Projection = {
  /** Distance du point au tracé, en mètres. */
  distance: number;
  /** Abscisse curviligne : mètres parcourus depuis le début du tracé. */
  along: number;
  /** Le point du tracé le plus proche. */
  point: LatLng;
};

// Projette p sur [a, b] : distance, et fraction t ∈ [0, 1] le long du segment.
function projectOnSegment(p: LatLng, a: LatLng, b: LatLng): { distance: number; t: number } {
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((p.latitude * Math.PI) / 180);
  const px = (p.longitude - a.longitude) * mPerDegLng;
  const py = (p.latitude - a.latitude) * M_PER_DEG_LAT;
  const bx = (b.longitude - a.longitude) * mPerDegLng;
  const by = (b.latitude - a.latitude) * M_PER_DEG_LAT;
  const lengthSq = bx * bx + by * by;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / lengthSq));
  return { distance: Math.hypot(px - t * bx, py - t * by), t };
}

function interpolate(a: LatLng, b: LatLng, t: number): LatLng {
  return {
    latitude: a.latitude + (b.latitude - a.latitude) * t,
    longitude: a.longitude + (b.longitude - a.longitude) * t,
  };
}

/**
 * Le point du tracé le plus proche de p.
 *
 * `fromAlong` ignore la partie du tracé déjà parcourue : sur un tracé qui
 * repasse près de lui-même (aller-retour par la même avenue), sans ça un
 * point en fin de parcours pourrait être projeté sur le début.
 */
export function projectOnPath(p: LatLng, path: LatLng[], fromAlong = 0): Projection {
  if (path.length === 0) return { distance: Infinity, along: 0, point: p };
  if (path.length === 1) return { distance: metersBetween(p, path[0]), along: 0, point: path[0] };

  let best: Projection = { distance: Infinity, along: 0, point: path[0] };
  let acc = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const segLength = metersBetween(path[i], path[i + 1]);
    if (acc + segLength >= fromAlong) {
      let { distance, t } = projectOnSegment(p, path[i], path[i + 1]);
      // Sur le segment où commence la recherche, on ne remonte pas avant
      // `fromAlong` : on se cale dessus.
      if (acc + t * segLength < fromAlong && segLength > 0) {
        t = (fromAlong - acc) / segLength;
        distance = metersBetween(p, interpolate(path[i], path[i + 1], t));
      }
      if (distance < best.distance) {
        best = { distance, along: acc + t * segLength, point: interpolate(path[i], path[i + 1], t) };
      }
    }
    acc += segLength;
  }
  return best;
}

export function distanceToPathM(p: LatLng, path: LatLng[]): number {
  return projectOnPath(p, path).distance;
}

// Le point situé à `along` mètres du début du tracé.
function pointAt(path: LatLng[], along: number): { point: LatLng; index: number } {
  let acc = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const segLength = metersBetween(path[i], path[i + 1]);
    if (acc + segLength >= along) {
      const t = segLength === 0 ? 0 : (along - acc) / segLength;
      return { point: interpolate(path[i], path[i + 1], Math.max(0, Math.min(1, t))), index: i };
    }
    acc += segLength;
  }
  return { point: path[path.length - 1], index: path.length - 2 };
}

/**
 * Morceau du tracé entre deux abscisses curvilignes. Si `toAlong` précède
 * `fromAlong`, le morceau est renvoyé à l'envers — c'est le cas d'une ligne
 * empruntée dans le sens inverse de celui où son tracé est enregistré.
 */
export function slicePath(path: LatLng[], fromAlong: number, toAlong: number): LatLng[] {
  if (path.length < 2) return path;
  if (fromAlong > toAlong) return slicePath(path, toAlong, fromAlong).reverse();
  const start = pointAt(path, fromAlong);
  const end = pointAt(path, toAlong);
  return [start.point, ...path.slice(start.index + 1, end.index + 1), end.point];
}

// Un arrêt plus loin que ça du tracé de sa ligne : le tracé ne correspond pas
// (arrêt déplacé depuis, ou tracé d'une autre variante de la ligne).
const MAX_STOP_TO_SHAPE_M = 200;
// Petits retours en arrière tolérés entre arrêts consécutifs (deux arrêts
// face à face de part et d'autre d'un carrefour).
const BACKTRACK_TOLERANCE_M = 30;

/**
 * Le morceau du tracé réel d'une ligne parcouru entre la montée et la
 * descente, ou `null` si ce tracé ne colle pas aux arrêts du trajet — auquel
 * cas il vaut mieux suivre les rues arrêt par arrêt que dessiner un tracé
 * faux.
 */
export function shapeBetweenStops(shape: LatLng[], stops: LatLng[]): LatLng[] | null {
  if (shape.length < 2 || stops.length < 2) return null;

  const alongs: number[] = [];
  for (const stop of stops) {
    const projection = projectOnPath(stop, shape);
    if (projection.distance > MAX_STOP_TO_SHAPE_M) return null;
    alongs.push(projection.along);
  }

  // Les arrêts doivent se succéder dans un seul sens le long du tracé.
  const forward = alongs[alongs.length - 1] >= alongs[0];
  for (let i = 1; i < alongs.length; i++) {
    const step = alongs[i] - alongs[i - 1];
    if (forward ? step < -BACKTRACK_TOLERANCE_M : step > BACKTRACK_TOLERANCE_M) return null;
  }

  const slice = slicePath(shape, alongs[0], alongs[alongs.length - 1]);
  // Garde-fou : un morceau plus court que la ligne droite entre la montée et
  // la descente trahit une projection sur le mauvais passage du tracé.
  const straight = metersBetween(stops[0], stops[stops.length - 1]);
  if (pathLengthM(slice) < straight * 0.8) return null;
  return slice;
}
