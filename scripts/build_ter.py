#!/usr/bin/env python3
"""Génère supabase/ter.sql : le Train Express Régional (TER) Dakar – AIBD.

- Les 14 gares en service, dans l'ordre de la ligne, à leur position relevée
  dans OpenStreetMap (gares exploitées par SETER).
- Le tracé réel de la voie (relation OSM « Train Express Régional : Dakar -
  Diamniadio - AIBD »), utilisé par l'app pour dessiner le trajet en train.
- Les horaires officiels (terdakar.sn) : tous les jours, 5h40–22h.

Les tarifs (zonaux) ne sont pas en base : ils sont calculés par l'app, voir
services/fares.ts.

Usage (depuis la racine du projet) :
    python3 scripts/build_ter.py
Puis exécuter supabase/ter.sql dans l'éditeur SQL Supabase.

Données © les contributeurs OpenStreetMap, licence ODbL.
"""

import json
import os
import time
import urllib.parse
import urllib.request

from build_line_shapes import chain_nearest, dist, project, simplify, sql_str

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'supabase', 'ter.sql')
USER_AGENT = 'Yoonbi-thesis/1.0 (TER)'
# API principale d'OpenStreetMap (plus fiable qu'Overpass, souvent saturé).
OSM_API = 'https://api.openstreetmap.org/api/0.6'
ROUTE_RELATION = 13645077  # Dakar - Diamniadio - AIBD

# (nom affiché dans Yoonbi, nœud OSM de la gare). Les noms portent « Gare TER »
# pour ne pas se confondre avec les arrêts de bus du même quartier (les noms
# d'arrêts sont uniques en base). OSM nomme « Mbao » la gare que SETER appelle
# Keur Mbaye Fall.
STATIONS = [
    ('Gare TER Dakar', 10245379100),
    ('Gare TER Colobane', 10245681535),
    ('Gare TER Hann', 10245681651),
    ('Gare TER Dalifort', 10245681696),
    ('Gare TER Baux Maraîchers', 10245681715),
    ('Gare TER Pikine', 10245736447),
    ('Gare TER Thiaroye', 10245736479),
    ('Gare TER Yeumbeul', 10245772241),
    ('Gare TER Keur Mbaye Fall', 10245772271),
    ('Gare TER PNR', 10245772285),
    ('Gare TER Rufisque', 10245772297),
    ('Gare TER Bargny', 10245849870),
    ('Gare TER Diamniadio', 10245849871),
    ('Gare TER AIBD', 14160412786),
]

MAX_STATION_OFFSET_M = 300


def osm(path):
    last = None
    for attempt in range(4):
        try:
            req = urllib.request.Request(f'{OSM_API}/{path}', headers={'User-Agent': USER_AGENT, 'Accept': 'application/json'})
            return json.load(urllib.request.urlopen(req, timeout=120))
        except Exception as e:
            last = e
            time.sleep(10)
    raise SystemExit(f'OpenStreetMap injoignable : {last}')


def main():
    ids = ','.join(str(n) for _, n in STATIONS)
    nodes = {e['id']: (e['lat'], e['lon']) for e in osm(f'nodes?nodes={ids}')['elements']}
    stations = [(name, nodes[n]) for name, n in STATIONS]

    full = osm(f'relation/{ROUTE_RELATION}/full')['elements']
    points = {e['id']: (e['lat'], e['lon']) for e in full if e['type'] == 'node'}
    ways = {e['id']: e for e in full if e['type'] == 'way'}
    relation = next(e for e in full if e['type'] == 'relation' and e['id'] == ROUTE_RELATION)
    segs = [
        [points[n] for n in ways[m['ref']]['nodes'] if n in points]
        for m in relation['members']
        if m['type'] == 'way' and m['ref'] in ways and m.get('role', '') in ('', 'forward', 'backward')
    ]
    raw, gap = chain_nearest(segs, stations[0][1])
    line = simplify(raw, 5)

    # Contrôle : chaque gare sur la voie, dans l'ordre.
    proj = [project(p, line) for _, p in stations]
    worst = max(d for d, _ in proj)
    ordered = all(proj[i + 1][1] >= proj[i][1] for i in range(len(proj) - 1))
    if worst > MAX_STATION_OFFSET_M or not ordered:
        raise SystemExit(f'Tracé incohérent (écart max {worst:.0f} m, ordre {ordered}).')
    km = sum(dist(line[i], line[i + 1]) for i in range(len(line) - 1)) / 1000

    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(f"""-- Yoonbi — Train Express Régional (TER) Dakar – AIBD
--
-- Généré par scripts/build_ter.py — ne pas modifier à la main.
-- À exécuter après schema.sql, seed.sql, seed_osm.sql et line_shapes.sql,
-- dans l'éditeur SQL Supabase. Rejouable sans risque.
--
-- {len(stations)} gares, {km:.1f} km de voie. Gares et tracé © les contributeurs
-- OpenStreetMap (ODbL) ; horaires : terdakar.sn. Les tarifs (zonaux) sont
-- calculés par l'app (services/fares.ts).

-- 1. Opérateur ------------------------------------------------------------------
insert into operators (name, short_name, color)
values ('Train Express Régional', 'TER', '#7C3AED')
on conflict (short_name) do update set name = excluded.name, color = excluded.color;

-- 2. Ligne ------------------------------------------------------------------------
insert into lines (operator_id, code, name, fare_fcfa)
select o.id, 'TER', 'Dakar ↔ AIBD', 500 from operators o where o.short_name = 'TER'
on conflict (operator_id, code) do update set name = excluded.name, fare_fcfa = excluded.fare_fcfa;

update lines set
  hours_label = 'Tous les jours · 5h40-22h',
  frequency_label = 'Toutes les 8 à 10 min jusqu''à Diamniadio · toutes les 24 min vers l''AIBD',
  schedule_estimated = false
where code = 'TER' and operator_id = (select id from operators where short_name = 'TER');

-- 3. Gares --------------------------------------------------------------------------
insert into stops (name, location) values
""")
        f.write(',\n'.join(
            f"  ({sql_str(name)}, st_setsrid(st_point({lng}, {lat}), 4326))" for name, (lat, lng) in stations
        ))
        f.write("\non conflict (name) do update set location = excluded.location;\n\n")
        f.write("""-- 4. Ordre des gares sur la ligne --------------------------------------------------
delete from line_stops where line_id = (select l.id from lines l join operators o on o.id = l.operator_id
  where o.short_name = 'TER' and l.code = 'TER');

insert into line_stops (line_id, stop_id, sequence)
select (select l.id from lines l join operators o on o.id = l.operator_id where o.short_name = 'TER' and l.code = 'TER'),
       s.id, v.seq
from (values
""")
        f.write(',\n'.join(f"  ({sql_str(name)}, {i + 1})" for i, (name, _) in enumerate(stations)))
        f.write(""") as v(name, seq)
join stops s on s.name = v.name;

-- 5. Tracé réel de la voie -------------------------------------------------------------
""")
        coords = json.dumps([[round(lng, 6), round(lat, 6)] for lat, lng in line], separators=(',', ':'))
        f.write(f"""insert into line_shapes (line_id, coords, source)
select l.id, '{coords}'::jsonb, 'OpenStreetMap, relation {ROUTE_RELATION}'
from lines l join operators o on o.id = l.operator_id
where o.short_name = 'TER' and l.code = 'TER'
on conflict (line_id) do update set coords = excluded.coords, source = excluded.source, updated_at = now();
""")
    print(f'{OUT} : {len(stations)} gares, {km:.1f} km, écart max gare/voie {worst:.0f} m, {len(line)} points.')


if __name__ == '__main__':
    main()
