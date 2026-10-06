#!/usr/bin/env python3
"""Génère data/places.json : les lieux utiles de Dakar affichés sur la carte.

Restaurants, hôtels, hôpitaux, pharmacies, mairies, marchés, universités,
monuments et sites, gares routières… relevés dans OpenStreetMap (API
Overpass) sur l'agglomération (Dakar, Pikine, Guédiawaye, Rufisque ouest).
Seuls les lieux nommés sont gardés ; banques et lieux de culte sont écartés,
trop nombreux pour une carte lisible (ils restent trouvables par la
recherche).

Données © les contributeurs OpenStreetMap, licence ODbL.

Usage : python3 scripts/build_places.py
"""

import json
import math
import os
import urllib.parse
import urllib.request

OVERPASS = 'https://overpass-api.de/api/interpreter'
USER_AGENT = 'Yoonbi/1.0 (projet de memoire, generation des lieux)'
BBOX = '14.64,-17.55,14.83,-17.28'
OUT = os.path.join(os.path.dirname(__file__), '..', 'data', 'places.json')

QUERY = f"""
[out:json][timeout:120];
(
  nwr["amenity"~"^(restaurant|fast_food|cafe|townhall|hospital|clinic|pharmacy|marketplace|university|bus_station|ferry_terminal|police)$"]["name"]({BBOX});
  nwr["tourism"~"^(hotel|attraction|museum|viewpoint)$"]["name"]({BBOX});
  nwr["historic"~"^(monument|memorial)$"]["name"]({BBOX});
  nwr["shop"="mall"]["name"]({BBOX});
  nwr["leisure"="stadium"]["name"]({BBOX});
);
out center tags;
"""

# Étiquette OSM → catégorie Yoonbi (mêmes noms que les icônes de l'app).
CATEGORY = {
    ('amenity', 'restaurant'): 'food',
    ('amenity', 'fast_food'): 'food',
    ('amenity', 'cafe'): 'food',
    ('amenity', 'townhall'): 'townhall',
    ('amenity', 'hospital'): 'hospital',
    ('amenity', 'clinic'): 'hospital',
    ('amenity', 'pharmacy'): 'pharmacy',
    ('amenity', 'marketplace'): 'market',
    ('amenity', 'university'): 'school',
    ('amenity', 'bus_station'): 'station',
    ('amenity', 'ferry_terminal'): 'station',
    ('amenity', 'police'): 'police',
    ('tourism', 'hotel'): 'hotel',
    ('tourism', 'attraction'): 'sight',
    ('tourism', 'museum'): 'sight',
    ('tourism', 'viewpoint'): 'sight',
    ('historic', 'monument'): 'sight',
    ('historic', 'memorial'): 'sight',
    ('shop', 'mall'): 'shopping',
    ('leisure', 'stadium'): 'sport',
}


def category_of(tags):
    for key in ('tourism', 'historic', 'amenity', 'shop', 'leisure'):
        cat = CATEGORY.get((key, tags.get(key)))
        if cat:
            return cat
    return None


def meters(a, b):
    dlat = (a[0] - b[0]) * 111320
    dlng = (a[1] - b[1]) * 111320 * math.cos(math.radians(a[0]))
    return math.hypot(dlat, dlng)


def main():
    data = urllib.parse.urlencode({'data': QUERY}).encode()
    req = urllib.request.Request(OVERPASS, data=data, headers={'User-Agent': USER_AGENT})
    elements = json.load(urllib.request.urlopen(req, timeout=180))['elements']

    places = []
    for e in elements:
        tags = e.get('tags', {})
        name = (tags.get('name:fr') or tags.get('name') or '').strip()
        cat = category_of(tags)
        lat = e.get('lat', e.get('center', {}).get('lat'))
        lon = e.get('lon', e.get('center', {}).get('lon'))
        if not name or not cat or lat is None or lon is None:
            continue
        # Un même lieu relevé deux fois (point + bâtiment) : on n'en garde qu'un.
        if any(p['n'] == name and meters((p['la'], p['lo']), (lat, lon)) < 150 for p in places):
            continue
        places.append({
            'id': f"{e['type'][0]}{e['id']}",
            'n': name,
            'c': cat,
            'la': round(lat, 6),
            'lo': round(lon, 6),
        })

    places.sort(key=lambda p: (p['c'], p['n']))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump({
            'source': 'OpenStreetMap (Overpass), © les contributeurs OpenStreetMap, ODbL',
            'places': places,
        }, f, ensure_ascii=False, separators=(',', ':'))

    from collections import Counter
    print(len(places), 'lieux :', dict(Counter(p['c'] for p in places)))


if __name__ == '__main__':
    main()
