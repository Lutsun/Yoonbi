#!/usr/bin/env python3
"""Génère supabase/line_shapes.sql à partir d'OpenStreetMap.

Deux choses, toutes deux vérifiées contre le réseau réellement en base :

1. Les positions d'arrêts relevées sur le terrain (seed_osm.sql) qui n'ont
   jamais été appliquées : seed_osm.sql insère ses arrêts avec
   `on conflict (name) do nothing`, donc quand seed.sql avait déjà créé un
   arrêt du même nom avec une position estimée, c'est l'estimation qui est
   restée. Le script les détecte (écart > 50 m) et écrit leur correction.

2. Le tracé réel de chaque ligne quand OpenStreetMap le connaît (relations
   route=bus), au lieu d'une route devinée entre deux arrêts. Un tracé n'est
   retenu que si TOUS les arrêts de la ligne en base sont à moins de
   MAX_STOP_OFFSET_M de lui, dans le bon ordre : un tracé qui ne colle pas
   aux arrêts ferait plus de mal que de bien.

Usage (depuis la racine du projet) :
    python3 scripts/build_line_shapes.py
Puis exécuter supabase/line_shapes.sql dans l'éditeur SQL Supabase.

Données © les contributeurs OpenStreetMap, licence ODbL.
"""

import json
import math
import os
import re
import sys
import urllib.parse
import urllib.request
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'supabase', 'line_shapes.sql')
USER_AGENT = 'Yoonbi-thesis/1.0 (line shapes)'
OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']
DAKAR_BBOX = '14.55,-17.6,14.95,-17.1'

MAX_STOP_OFFSET_M = 250   # distance maximale d'un arrêt au tracé
MAX_CHAIN_GAP_M = 150     # trou toléré entre deux tronçons OSM consécutifs
SIMPLIFY_TOLERANCE_M = 4  # simplification Douglas-Peucker
STOP_FIX_THRESHOLD_M = 50

# Relations OSM candidates pour chaque ligne en base (opérateur, code).
# Plusieurs candidates = les deux sens, ou des relations concurrentes : la
# mieux ajustée aux arrêts est retenue.
CANDIDATES = {
    ('BRT', 'B1'): [19961937, 19961993],
    ('BRT', 'B3'): [19961937, 19961993],  # même couloir que la B1
    ('DDD', 'Ligne 1'): [6951328],
    ('DDD', 'Ligne 4'): [6990830, 7203970],
    ('DDD', 'Ligne 7'): [6990669, 7500475],
    ('DDD', 'Ligne 9'): [6996431, 7487218],
    ('DDD', 'Ligne 10'): [6990845, 7488283],
    ('DDD', 'Ligne 23'): [7495279],
    ('DDD', 'Ligne 121'): [6990794, 6999013],
    ('DDD', 'Ligne 8'): [7495137],
    ('DDD', 'Ligne 18'): [7499475],
    ('AFTU', 'Ligne 40'): [3982642],
}


def load_env():
    env = {}
    with open(os.path.join(ROOT, '.env')) as f:
        for line in f:
            if '=' in line and not line.lstrip().startswith('#'):
                k, v = line.strip().split('=', 1)
                env[k] = v.strip().strip('"')
    return env


def http(url, data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers={'User-Agent': USER_AGENT, **(headers or {})})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())


def fetch_graph(env):
    url = env['EXPO_PUBLIC_SUPABASE_URL'] + '/rest/v1/rpc/get_route_graph'
    key = env['EXPO_PUBLIC_SUPABASE_ANON_KEY']
    return http(url, b'{}', {'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'})


def fetch_osm():
    query = f'[out:json][timeout:90];relation["route"="bus"]({DAKAR_BBOX});out body;>;out skel geom qt;'
    body = urllib.parse.urlencode({'data': query}).encode()
    last = None
    for endpoint in OVERPASS:
        try:
            return http(endpoint, body, {'Accept': 'application/json'})
        except Exception as e:  # serveur surchargé : on essaie le suivant
            last = e
    raise SystemExit(f'Overpass injoignable : {last}')


# --- géométrie ---------------------------------------------------------------

def dist(a, b):
    k = math.cos(math.radians((a[0] + b[0]) / 2))
    return math.hypot((a[0] - b[0]) * 111320, (a[1] - b[1]) * 111320 * k)


def point_segment(p, a, b):
    kx, ky = 111320 * math.cos(math.radians(p[0])), 111320
    px, py = (p[1] - a[1]) * kx, (p[0] - a[0]) * ky
    bx, by = (b[1] - a[1]) * kx, (b[0] - a[0]) * ky
    length2 = bx * bx + by * by
    t = 0 if length2 == 0 else max(0, min(1, (px * bx + py * by) / length2))
    return math.hypot(px - t * bx, py - t * by), t


def project(p, line):
    """(distance au tracé, abscisse curviligne) du point le plus proche."""
    best, acc = (math.inf, 0.0), 0.0
    for i in range(len(line) - 1):
        d, t = point_segment(p, line[i], line[i + 1])
        seg = dist(line[i], line[i + 1])
        if d < best[0]:
            best = (d, acc + t * seg)
        acc += seg
    return best


def length(line):
    return sum(dist(line[i], line[i + 1]) for i in range(len(line) - 1))


def simplify(points, tolerance):
    stack, keep = [(0, len(points) - 1)], {0, len(points) - 1}
    while stack:
        i, j = stack.pop()
        best, index = -1, None
        for k in range(i + 1, j):
            d = point_segment(points[k], points[i], points[j])[0]
            if d > best:
                best, index = d, k
        if index is not None and best > tolerance:
            keep.add(index)
            stack += [(i, index), (index, j)]
    return [points[i] for i in sorted(keep)]


# --- tracés OSM ----------------------------------------------------------------

def way_segments(rel, ways):
    out = []
    for m in rel['members']:
        if m['type'] == 'way' and m.get('role', '') in ('', 'forward', 'backward'):
            w = ways.get(m['ref'])
            if w and 'geometry' in w:
                out.append([(p['lat'], p['lon']) for p in w['geometry']])
    return out


def chain_in_order(segs):
    """Assemble les tronçons dans l'ordre de la relation."""
    line = list(segs[0])
    if len(segs) > 1:
        s = segs[1]
        if min(dist(line[0], s[0]), dist(line[0], s[-1])) < min(dist(line[-1], s[0]), dist(line[-1], s[-1])):
            line.reverse()
    max_gap = 0.0
    for s in segs[1:]:
        end = line[-1]
        nxt = s if dist(end, s[0]) <= dist(end, s[-1]) else list(reversed(s))
        max_gap = max(max_gap, dist(end, nxt[0]))
        line.extend(nxt)
    return line, max_gap


def chain_nearest(segs, start):
    """Assemble les tronçons en prenant à chaque fois le plus proche — pour
    les relations dont l'ordre des membres est désordonné dans OSM."""
    remaining = list(range(len(segs)))
    first = min(remaining, key=lambda i: min(dist(start, segs[i][0]), dist(start, segs[i][-1])))
    s = segs[first]
    line = list(s) if dist(start, s[0]) <= dist(start, s[-1]) else list(reversed(s))
    remaining.remove(first)
    max_gap = 0.0
    while remaining:
        end = line[-1]
        best = min(remaining, key=lambda i: min(dist(end, segs[i][0]), dist(end, segs[i][-1])))
        s = segs[best]
        gap = min(dist(end, s[0]), dist(end, s[-1]))
        if gap > 400:
            break
        max_gap = max(max_gap, gap)
        line.extend(s if dist(end, s[0]) <= dist(end, s[-1]) else list(reversed(s)))
        remaining.remove(best)
    return line, max_gap


def fit(stops, raw, max_gap):
    """Valide un tracé contre les arrêts de la ligne, orienté dans leur ordre."""
    line = simplify(raw, SIMPLIFY_TOLERANCE_M)
    projections = [project(s, line) for s in stops]
    offsets = [p[0] for p in projections]
    along = [p[1] for p in projections]
    forward = sum(1 for i in range(len(along) - 1) if along[i + 1] >= along[i])
    backward = len(along) - 1 - forward
    if backward > forward:
        line.reverse()
    disorder = min(forward, backward)
    ok = (max(offsets) <= MAX_STOP_OFFSET_M and disorder <= max(1, len(stops) // 8)
          and max_gap <= MAX_CHAIN_GAP_M)
    return ok, line, max(offsets)


def sql_str(s):
    return "'" + s.replace("'", "''") + "'"


def main():
    env = load_env()
    print('Réseau en base…', file=sys.stderr)
    graph = fetch_graph(env)
    print('Relations OpenStreetMap…', file=sys.stderr)
    osm = fetch_osm()

    # 1. Positions relevées jamais appliquées.
    pattern = re.compile(r"\('((?:[^']|'')+)',\s*st_setsrid\(st_point\(([-\d.]+),\s*([-\d.]+)\)")
    surveyed = {m.group(1).replace("''", "'"): (float(m.group(3)), float(m.group(2)))
                for m in pattern.finditer(open(os.path.join(ROOT, 'supabase', 'seed_osm.sql')).read())}
    in_db = {r['stop_name']: (r['latitude'], r['longitude']) for r in graph}
    fixes = {name: pos for name, pos in surveyed.items()
             if name in in_db and dist(pos, in_db[name]) > STOP_FIX_THRESHOLD_M}
    for name, pos in sorted(fixes.items(), key=lambda kv: -dist(kv[1], in_db[kv[0]])):
        print(f'  arrêt corrigé : {name} ({round(dist(pos, in_db[name]))} m)', file=sys.stderr)

    # 2. Tracés, validés contre les arrêts avec leurs positions corrigées.
    lines = defaultdict(list)
    for r in graph:
        pos = fixes.get(r['stop_name'], (r['latitude'], r['longitude']))
        lines[(r['operator_short_name'], r['line_code'])].append((r['sequence'], pos))
    ways = {e['id']: e for e in osm['elements'] if e['type'] == 'way'}
    rels = {e['id']: e for e in osm['elements'] if e['type'] == 'relation'}

    shapes = []
    for key, rel_ids in CANDIDATES.items():
        if key not in lines:
            continue
        stops = [pos for _, pos in sorted(lines[key])]
        best = None
        for rel_id in rel_ids:
            if rel_id not in rels:
                continue
            segs = way_segments(rels[rel_id], ways)
            if not segs:
                continue
            for raw, gap in (chain_in_order(segs), chain_nearest(segs, stops[0]), chain_nearest(segs, stops[-1])):
                if len(raw) < 2:
                    continue
                ok, line, offset = fit(stops, raw, gap)
                if ok and (best is None or offset < best[2]):
                    best = (rel_id, line, offset)
        if best:
            rel_id, line, offset = best
            print(f'  tracé retenu : {key[0]} {key[1]} (relation {rel_id}, {length(line) / 1000:.1f} km, '
                  f'arrêts à {round(offset)} m max)', file=sys.stderr)
            shapes.append((key, rel_id, line))
        else:
            print(f'  pas de tracé fiable : {key[0]} {key[1]}', file=sys.stderr)

    with open(OUT, 'w') as f:
        f.write(HEADER)
        f.write('\n-- 1. Positions relevées sur le terrain jamais appliquées ' + '-' * 18 + '\n')
        for name, (lat, lng) in sorted(fixes.items()):
            f.write(f"update stops set location = st_setsrid(st_point({lng}, {lat}), 4326) "
                    f"where name = {sql_str(name)};\n")
        f.write(SCHEMA)
        f.write('\n-- 3. Tracés réels ' + '-' * 58 + '\n')
        for (operator, code), rel_id, line in shapes:
            coords = json.dumps([[round(p[1], 6), round(p[0], 6)] for p in line], separators=(',', ':'))
            f.write(f"\ninsert into line_shapes (line_id, coords, source)\n"
                    f"select l.id, '{coords}'::jsonb, 'OpenStreetMap, relation {rel_id}'\n"
                    f"from lines l join operators o on o.id = l.operator_id\n"
                    f"where o.short_name = {sql_str(operator)} and l.code = {sql_str(code)}\n"
                    f"on conflict (line_id) do update set coords = excluded.coords, "
                    f"source = excluded.source, updated_at = now();\n")
    print(f'Écrit : {os.path.relpath(OUT, ROOT)} ({len(fixes)} arrêts, {len(shapes)} tracés)', file=sys.stderr)


HEADER = """-- Yoonbi — positions d'arrêts relevées et tracés réels des lignes
--
-- Généré par scripts/build_line_shapes.py — ne pas modifier à la main.
-- À exécuter après schema.sql, seed.sql, seed_osm.sql et admin.sql, dans
-- l'éditeur SQL Supabase. Rejouable sans risque.
--
-- Données © les contributeurs OpenStreetMap, licence ODbL.
"""

SCHEMA = """
-- 2. Tracés des lignes ------------------------------------------------------
-- Le chemin exact parcouru par le bus, dans l'ordre des arrêts de la ligne
-- ([longitude, latitude], ...). L'app découpe ce tracé entre l'arrêt de
-- montée et celui de descente ; sans tracé, elle suit les rues arrêt par
-- arrêt. Si les arrêts d'une ligne sont modifiés au point de ne plus coller à
-- son tracé, l'app l'ignore d'elle-même.
create table if not exists line_shapes (
  line_id uuid primary key references lines (id) on delete cascade,
  coords jsonb not null,
  source text not null,
  updated_at timestamptz not null default now()
);

alter table line_shapes enable row level security;

drop policy if exists "Lecture publique des tracés de ligne" on line_shapes;
create policy "Lecture publique des tracés de ligne" on line_shapes for select using (true);

drop policy if exists "Écriture admin des tracés de ligne" on line_shapes;
create policy "Écriture admin des tracés de ligne" on line_shapes
  for all using (is_admin()) with check (is_admin());
"""

if __name__ == '__main__':
    main()
