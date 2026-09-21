import { Stop } from '../types/transit';

// Recherche de lieux au Sénégal (mairies, hôpitaux, marchés, écoles…) avec
// Nominatim, le moteur de recherche d'adresses d'OpenStreetMap — © les
// contributeurs OpenStreetMap, licence ODbL. Politique d'usage : un
// User-Agent identifiable et au plus une requête par seconde, ce que
// garantit l'anti-rebond de l'écran de recherche.
const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
// Priorité à l'agglomération de Dakar, sans exclure le reste du pays.
const DAKAR_VIEWBOX = '-17.6,14.95,-17.1,14.55';

type NominatimResult = {
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  name?: string;
  category: string;
  type: string;
  display_name: string;
};

const CATEGORY_BY_TYPE: Record<string, string> = {
  hospital: 'hospital',
  clinic: 'hospital',
  doctors: 'hospital',
  pharmacy: 'pharmacy',
  townhall: 'townhall',
  community_centre: 'townhall',
  marketplace: 'market',
  school: 'school',
  university: 'school',
  college: 'school',
  place_of_worship: 'worship',
  police: 'police',
  bank: 'bank',
  bus_station: 'station',
  ferry_terminal: 'station',
  aerodrome: 'station',
  station: 'station',
  stadium: 'sport',
  restaurant: 'food',
  hotel: 'hotel',
};

function categoryOf(r: NominatimResult): string {
  return CATEGORY_BY_TYPE[r.type] ?? (r.category === 'place' ? 'area' : 'place');
}

// « Mairie de Yoff, Avenue X, Commune de Y, … » → nom et sous-titre.
function splitName(r: NominatimResult): { name: string; subtitle: string } {
  const parts = r.display_name.split(',').map((p) => p.trim());
  const name = r.name?.trim() || parts[0];
  const rest = parts.slice(1).filter((p) => p && p !== name && !/^\d+$/.test(p));
  // Le quartier / la commune suffisent pour reconnaître le lieu.
  const commune = rest.find((p) => /commune|arrondissement/i.test(p)) ?? rest[0] ?? '';
  return { name, subtitle: commune.replace(/^Commune (d'|de |du )?/i, '') };
}

export async function searchPlaces(query: string): Promise<Stop[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  const params = new URLSearchParams({
    q,
    format: 'jsonv2',
    countrycodes: 'sn',
    limit: '6',
    'accept-language': 'fr',
    viewbox: DAKAR_VIEWBOX,
  });

  const res = await fetch(`${ENDPOINT}?${params}`, {
    headers: { 'User-Agent': 'Yoonbi-app/1.0 (thesis project)' },
  });
  if (!res.ok) throw new Error(`Recherche de lieux indisponible (${res.status})`);
  const json: NominatimResult[] = await res.json();

  const seen = new Set<string>();
  const places: Stop[] = [];
  for (const r of json) {
    // Les arrêts de bus d'OSM sont déjà couverts par notre propre réseau.
    if (r.type === 'bus_stop') continue;
    const { name, subtitle } = splitName(r);
    const key = `${name}|${subtitle}`;
    if (seen.has(key)) continue;
    seen.add(key);
    places.push({
      id: `place:${r.osm_type}${r.osm_id}`,
      name,
      subtitle,
      category: categoryOf(r),
      isPlace: true,
      latitude: Number(r.lat),
      longitude: Number(r.lon),
    });
  }
  return places;
}
