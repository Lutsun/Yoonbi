#!/usr/bin/env python3
"""Génère supabase/ter_bus_stops.sql : des arrêts de bus devant les gares TER.

Pour qu'un trajet puisse combiner bus et TER, il faut un arrêt de bus à
quelques pas de la gare, sur une ligne qui y passe réellement. Pour chaque
gare, et pour chaque ligne de bus en base qui passe tout près :

- l'arrêt est placé sur un arrêt de bus relevé dans OpenStreetMap
  (highway=bus_stop) s'il y en a un près de la gare et sur le passage de la
  ligne ; sinon, quand la ligne passe à moins de NO_OSM_MAX_M de la gare, au
  point de son passage le plus proche de la gare ;
- il est inséré dans l'ordre de la ligne, entre les deux arrêts qui
  l'encadrent.

Un arrêt par gare (« Arrêt Gare TER … »), partagé par toutes les lignes qui
le desservent. Les gares déjà reliées à un arrêt existant à moins de
ALREADY_CONNECTED_M sont laissées telles quelles.

Usage (depuis la racine du projet) :
    python3 scripts/build_ter_connections.py
Puis exécuter supabase/ter_bus_stops.sql dans l'éditeur SQL Supabase.

Données © les contributeurs OpenStreetMap, licence ODbL.
"""

import json
import os
import time
import urllib.request

from build_line_shapes import dist, point_segment, project, sql_str

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'supabase', 'ter_bus_stops.sql')
USER_AGENT = 'Yoonbi-thesis/1.0 (TER connections)'
OSM_API = 'https://api.openstreetmap.org/api/0.6'

LINE_MAX_M = 200          # la ligne passe à moins de ça de la gare
OSM_STOP_FROM_STATION_M = 300
OSM_STOP_FROM_LINE_M = 250  # les lignes estimées passent « à peu près » : on tolère l'écart
NO_OSM_MAX_M = 100        # sans arrêt OSM : seulement si la ligne frôle la gare
ALREADY_CONNECTED_M = 150


def http(url):
    last = None
    for _ in range(4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept': 'application/json'})
            return json.load(urllib.request.urlopen(req, timeout=120))
        except Exception as e:
            last = e
            time.sleep(5)
    raise SystemExit(f'Injoignable : {url} ({last})')


def load_env():
    env = {}
    with open(os.path.join(ROOT, '.env')) as f:
        for line in f:
            if '=' in line and not line.startswith('#'):
                k, v = line.strip().split('=', 1)
                env[k] = v
    return env


def fetch_graph(env):
    req = urllib.request.Request(
        env['EXPO_PUBLIC_SUPABASE_URL'] + '/rest/v1/rpc/get_route_graph',
        data=b'{}',
        headers={'apikey': env['EXPO_PUBLIC_SUPABASE_ANON_KEY'], 'Content-Type': 'application/json'},
    )
    return json.load(urllib.request.urlopen(req, timeout=120))


def osm_bus_stops(lat, lon):
    d = 0.006
    els = http(f'{OSM_API}/map?bbox={lon - d},{lat - d},{lon + d},{lat + d}')['elements']
    return [(e['lat'], e['lon']) for e in els if e['type'] == 'node' and e.get('tags', {}).get('highway') == 'bus_stop']


def closest_point(p, a, b):
    _, t = point_segment(p, a, b)
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t), t


def main():
    rows = fetch_graph(load_env())
    lines = {}
    for r in sorted(rows, key=lambda r: r['sequence']):
        line = lines.setdefault(r['line_id'], {'op': r['operator_short_name'], 'code': r['line_code'], 'stops': []})
        line['stops'].append((r['stop_name'], (r['latitude'], r['longitude'])))
    bus_stops = {name: p for l in lines.values() if l['op'] != 'TER' for name, p in l['stops']}
    stations = next(l for l in lines.values() if l['op'] == 'TER')['stops']

    plan = []  # (gare, position de l'arrêt, [(opérateur, ligne, arrêt après lequel insérer)])
    for station, sp in stations:
        nearest = min((dist(sp, p) for p in bus_stops.values()), default=1e9)
        if nearest <= ALREADY_CONNECTED_M:
            print(f'{station} : déjà relié (arrêt à {nearest:.0f} m)')
            continue
        osm = osm_bus_stops(*sp)
        candidates = []
        for line in lines.values():
            if line['op'] == 'TER' or len(line['stops']) < 2:
                continue
            pts = [p for _, p in line['stops']]
            d, _ = project(sp, pts)
            if d > LINE_MAX_M:
                continue
            # Segment de la ligne où elle passe au plus près de la gare.
            i = min(range(len(pts) - 1), key=lambda k: point_segment(sp, pts[k], pts[k + 1])[0])
            foot, t = closest_point(sp, pts[i], pts[i + 1])
            if not 0 < t < 1:
                continue  # la gare est au-delà d'un terminus : pas « sur le passage »
            candidates.append((line, i, foot, d))
        if not candidates:
            print(f'{station} : aucune ligne ne passe devant')
            continue

        # Position : l'arrêt OSM le plus proche du passage des lignes, sinon le
        # point de passage lui-même (seulement si la ligne frôle la gare).
        def score(p):
            return sum(min(dist(p, c[2]), 1e9) for c in candidates)
        osm_ok = [p for p in osm if dist(p, sp) <= OSM_STOP_FROM_STATION_M
                  and min(dist(p, c[2]) for c in candidates) <= OSM_STOP_FROM_LINE_M]
        if osm_ok:
            pos, source = min(osm_ok, key=score), 'arrêt OpenStreetMap'
        else:
            close = [c for c in candidates if c[3] <= NO_OSM_MAX_M]
            if not close:
                print(f'{station} : lignes à {min(c[3] for c in candidates):.0f} m, aucun arrêt OSM — ignorée')
                continue
            candidates, pos, source = close, close[0][2], 'passage de la ligne'
        served = [(c[0]['op'], c[0]['code'], c[0]['stops'][c[1]][0]) for c in candidates]
        plan.append((station, pos, served))
        print(f"{station} : arrêt à {dist(pos, sp):.0f} m ({source}) — " + ', '.join(f'{o} {c}' for o, c, _ in served))

    with open(OUT, 'w', encoding='utf-8') as f:
        f.write("""-- Yoonbi — arrêts de bus devant les gares TER
--
-- Généré par scripts/build_ter_connections.py — ne pas modifier à la main.
-- À exécuter après ter.sql, dans l'éditeur SQL Supabase. Rejouable sans
-- risque : un arrêt déjà présent sur une ligne n'y est pas ajouté deux fois.
--
-- Positions © les contributeurs OpenStreetMap (ODbL) quand un arrêt y est
-- relevé ; sinon, le point de passage de la ligne au plus près de la gare.

""")
        for station, (lat, lng), served in plan:
            name = 'Arrêt ' + station
            f.write(f"-- {station}\n")
            f.write(f"insert into stops (name, location) values ({sql_str(name)}, st_setsrid(st_point({lng:.7f}, {lat:.7f}), 4326))\n")
            f.write("on conflict (name) do update set location = excluded.location;\n\n")
            for op, code, after in served:
                f.write(f"""do $$
declare
  v_line uuid := (select l.id from lines l join operators o on o.id = l.operator_id
                  where o.short_name = {sql_str(op)} and l.code = {sql_str(code)});
  v_stop uuid := (select id from stops where name = {sql_str(name)});
  v_after int := (select ls.sequence from line_stops ls join stops s on s.id = ls.stop_id
                  where ls.line_id = v_line and s.name = {sql_str(after)} order by ls.sequence limit 1);
begin
  if v_line is null or v_stop is null or v_after is null then return; end if;
  if exists (select 1 from line_stops where line_id = v_line and stop_id = v_stop) then return; end if;
  -- Décale les arrêts suivants (en deux temps : la clé (ligne, ordre) est unique).
  update line_stops set sequence = sequence + 100000 where line_id = v_line and sequence > v_after;
  update line_stops set sequence = sequence - 99999 where line_id = v_line and sequence > 100000;
  insert into line_stops (line_id, stop_id, sequence) values (v_line, v_stop, v_after + 1);
end $$;

""")
    print(f'\n{OUT} : {len(plan)} arrêt(s), {sum(len(s) for _, _, s in plan)} desserte(s).')


if __name__ == '__main__':
    main()
