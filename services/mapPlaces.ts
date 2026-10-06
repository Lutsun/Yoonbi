import { Ionicons } from '@expo/vector-icons';
import placesData from '../data/places.json';
import { Stop } from '../types/transit';
import { searchKey } from '../utils/text';

// Les lieux utiles de Dakar affichés sur la carte d'accueil (restaurants,
// hôtels, hôpitaux, mairies, monuments…), générés depuis OpenStreetMap par
// scripts/build_places.py — © les contributeurs OpenStreetMap, ODbL.
// Embarqués dans l'app : affichés instantanément, même sans connexion.

export type PlaceCategory =
  | 'food'
  | 'hotel'
  | 'hospital'
  | 'pharmacy'
  | 'townhall'
  | 'market'
  | 'school'
  | 'sight'
  | 'station'
  | 'shopping'
  | 'sport'
  | 'police';

type RawPlace = { id: string; n: string; c: PlaceCategory; la: number; lo: number };

// Libellé, icône et couleur de chaque catégorie. Les couleurs évitent celles
// des réseaux (vert-bleu BRT, bleu DDD, ambre AFTU) : un lieu ne doit jamais
// être pris pour un arrêt.
export const PLACE_CATEGORIES: Record<
  PlaceCategory,
  { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; minZoomDelta: number }
> = {
  // `minZoomDelta` : le lieu n'apparaît qu'une fois la carte assez zoomée
  // (latitudeDelta en dessous de cette valeur) — sinon, des centaines de
  // restaurants recouvriraient tout Dakar.
  sight: { label: 'Monument, site', icon: 'camera', color: '#C2255C', minZoomDelta: 0.25 },
  townhall: { label: 'Mairie', icon: 'business', color: '#495057', minZoomDelta: 0.08 },
  hospital: { label: 'Hôpital, clinique', icon: 'medkit', color: '#E03131', minZoomDelta: 0.08 },
  station: { label: 'Gare, embarcadère', icon: 'boat', color: '#495057', minZoomDelta: 0.08 },
  market: { label: 'Marché', icon: 'basket', color: '#B07B00', minZoomDelta: 0.08 },
  shopping: { label: 'Centre commercial', icon: 'bag-handle', color: '#7048E8', minZoomDelta: 0.08 },
  school: { label: 'Université, école', icon: 'school', color: '#1971C2', minZoomDelta: 0.06 },
  sport: { label: 'Stade', icon: 'football', color: '#2F9E44', minZoomDelta: 0.08 },
  hotel: { label: 'Hôtel', icon: 'bed', color: '#7048E8', minZoomDelta: 0.04 },
  police: { label: 'Police', icon: 'shield', color: '#364FC7', minZoomDelta: 0.03 },
  food: { label: 'Restaurant', icon: 'restaurant', color: '#E8590C', minZoomDelta: 0.025 },
  pharmacy: { label: 'Pharmacie', icon: 'medical', color: '#2F9E44', minZoomDelta: 0.025 },
};

// Ordre d'importance quand il faut se limiter : les repères avant les commerces.
const PRIORITY: PlaceCategory[] = [
  'sight',
  'townhall',
  'hospital',
  'station',
  'market',
  'shopping',
  'school',
  'sport',
  'hotel',
  'police',
  'pharmacy',
  'food',
];

export type MapPlace = Stop & { category: PlaceCategory };

const ALL: MapPlace[] = (placesData.places as RawPlace[]).map((p) => ({
  id: `place:${p.id}`,
  name: p.n,
  category: p.c,
  subtitle: PLACE_CATEGORIES[p.c].label,
  isPlace: true,
  latitude: p.la,
  longitude: p.lo,
}));

const KEYS = ALL.map((p) => searchKey(p.name));

export type Region = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };

const MAX_VISIBLE = 70;

/** Les lieux à afficher dans la portion de carte visible, selon le zoom. */
export function placesInRegion(region: Region): MapPlace[] {
  const latMin = region.latitude - region.latitudeDelta / 2;
  const latMax = region.latitude + region.latitudeDelta / 2;
  const lngMin = region.longitude - region.longitudeDelta / 2;
  const lngMax = region.longitude + region.longitudeDelta / 2;
  const visible = ALL.filter(
    (p) =>
      region.latitudeDelta <= PLACE_CATEGORIES[p.category].minZoomDelta &&
      p.latitude >= latMin &&
      p.latitude <= latMax &&
      p.longitude >= lngMin &&
      p.longitude <= lngMax
  );
  if (visible.length <= MAX_VISIBLE) return visible;
  return visible
    .sort((a, b) => PRIORITY.indexOf(a.category) - PRIORITY.indexOf(b.category))
    .slice(0, MAX_VISIBLE);
}

/**
 * Recherche instantanée et hors ligne parmi les lieux de la carte. Chaque mot
 * tapé doit commencer un mot du nom, dans n'importe quel ordre :
 * « monument renaiss » trouve « Monument de la Renaissance Africaine »,
 * « hopital fann » trouve « Hôpital de Fann ».
 */
export function searchMapPlaces(query: string, limit = 6): MapPlace[] {
  const words = searchKey(query).split(/\s+/).filter((w) => w.length > 0);
  if (words.join('').length < 2) return [];
  const found: { place: MapPlace; score: number }[] = [];
  for (let i = 0; i < ALL.length; i++) {
    const nameWords = KEYS[i].split(/[\s'’\-]+/);
    if (!words.every((w) => nameWords.some((n) => n.startsWith(w)))) continue;
    // Les noms qui commencent par la recherche d'abord, puis les repères
    // (monuments, mairies…) avant les commerces.
    const score = (KEYS[i].startsWith(words[0]) ? 0 : 100) + PRIORITY.indexOf(ALL[i].category);
    found.push({ place: ALL[i], score });
  }
  return found
    .sort((a, b) => a.score - b.score || a.place.name.length - b.place.name.length)
    .slice(0, limit)
    .map((f) => f.place);
}
