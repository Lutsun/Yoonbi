import { MaterialCommunityIcons } from '@expo/vector-icons';
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
  {
    label: string;
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
    color: string;
    minZoomDelta: number;
  }
> = {
  // `minZoomDelta` : le lieu n'apparaît qu'une fois la carte zoomée (zone
  // visible moins large que ce longitudeDelta). À l'ouverture de la carte
  // (≈ 0,015), seuls les grands repères se montrent ; il faut zoomer pour voir
  // le reste — les arrêts restent ainsi au premier plan.
  sight: { label: 'Monument, site', icon: 'castle', color: '#C2255C', minZoomDelta: 0.02 },
  townhall: { label: 'Mairie', icon: 'town-hall', color: '#5C677D', minZoomDelta: 0.012 },
  hospital: { label: 'Hôpital, clinique', icon: 'hospital-box', color: '#E03131', minZoomDelta: 0.012 },
  station: { label: 'Gare, embarcadère', icon: 'ferry', color: '#5C677D', minZoomDelta: 0.012 },
  market: { label: 'Marché', icon: 'basket', color: '#D9480F', minZoomDelta: 0.01 },
  shopping: { label: 'Centre commercial', icon: 'shopping', color: '#7048E8', minZoomDelta: 0.01 },
  school: { label: 'Université, école', icon: 'school', color: '#1971C2', minZoomDelta: 0.01 },
  sport: { label: 'Stade', icon: 'stadium', color: '#2F9E44', minZoomDelta: 0.01 },
  hotel: { label: 'Hôtel', icon: 'bed', color: '#7048E8', minZoomDelta: 0.008 },
  police: { label: 'Police', icon: 'police-badge', color: '#364FC7', minZoomDelta: 0.006 },
  food: { label: 'Restaurant', icon: 'silverware-fork-knife', color: '#E8590C', minZoomDelta: 0.006 },
  pharmacy: { label: 'Pharmacie', icon: 'pill', color: '#2F9E44', minZoomDelta: 0.006 },
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

// Les arrêts restent l'information principale : peu de lieux à la fois, et
// jamais un lieu collé à un arrêt (il le masquerait).
const MAX_VISIBLE = 30;
const STOP_CLEARANCE_M = 70;

/** Les lieux à afficher dans la portion de carte visible, selon le zoom. */
export function placesInRegion(region: Region, stops: { latitude: number; longitude: number }[] = []): MapPlace[] {
  const latMin = region.latitude - region.latitudeDelta / 2;
  const latMax = region.latitude + region.latitudeDelta / 2;
  const lngMin = region.longitude - region.longitudeDelta / 2;
  const lngMax = region.longitude + region.longitudeDelta / 2;
  const visible = ALL.filter(
    (p) =>
      // Largeur visible (en degrés) : sur un téléphone en portrait, la hauteur
      // est deux fois plus grande et rendait le seuil trop strict.
      region.longitudeDelta <= PLACE_CATEGORIES[p.category].minZoomDelta &&
      p.latitude >= latMin &&
      p.latitude <= latMax &&
      p.longitude >= lngMin &&
      p.longitude <= lngMax &&
      !stops.some(
        (st) =>
          Math.abs(st.latitude - p.latitude) * 111_320 < STOP_CLEARANCE_M &&
          Math.abs(st.longitude - p.longitude) * 107_700 < STOP_CLEARANCE_M
      )
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
