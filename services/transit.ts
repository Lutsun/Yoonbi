import { supabase } from './supabase';
import { Line, Operator, RouteGraphRow, Stop } from '../types/transit';
import {
  loadNetworkCache,
  loadSchedulesCache,
  saveNetworkCache,
  saveSchedulesCache,
  ScheduleRow,
} from './offlineCache';

export async function getOperators(): Promise<Operator[]> {
  const { data, error } = await supabase.from('operators').select('*');
  if (error) throw error;
  return data;
}

export async function getLines(): Promise<Line[]> {
  const { data, error } = await supabase.from('lines').select('*');
  if (error) throw error;
  return data;
}

// Une ligne précise, avec ses horaires — utilisé par la fiche ligne
// (app/(modals)/bus-details.tsx).
export async function getLine(lineId: string): Promise<Line> {
  const { data, error } = await supabase.from('lines').select('*').eq('id', lineId).single();
  if (error) throw error;
  return data;
}

// Arrêts d'une ligne, dans l'ordre, via la fonction PostGIS
// `get_line_stops` définie dans supabase/schema.sql.
export async function getLineStops(lineId: string): Promise<Stop[]> {
  const { data, error } = await supabase.rpc('get_line_stops', { p_line_id: lineId });
  if (error) throw error;
  return data;
}

// Recherche d'arrêts par nom, via la fonction PostGIS `search_stops`
// définie dans supabase/schema.sql.
export async function searchStops(query: string): Promise<Stop[]> {
  if (!query.trim()) return [];
  const { data, error } = await supabase.rpc('search_stops', { query: query.trim() });
  if (error) throw error;
  return data;
}

// Arrêts les plus proches d'un point (position de l'utilisateur), via la
// fonction PostGIS `nearby_stops` définie dans supabase/schema.sql.
export async function getNearbyStops(
  latitude: number,
  longitude: number,
  radiusMeters = 1500
): Promise<Stop[]> {
  const { data, error } = await supabase.rpc('nearby_stops', {
    lat: latitude,
    lng: longitude,
    radius_meters: radiusMeters,
  });
  if (error) throw error;
  return data;
}

// Le réseau complet (toutes les lignes et leurs arrêts, dans l'ordre), via
// la fonction PostGIS `get_route_graph` — utilisé par le planificateur
// d'itinéraire (services/routing.ts) pour construire son graphe de trajet.
export async function getRouteGraph(): Promise<RouteGraphRow[]> {
  try {
    const { data, error } = await supabase.rpc('get_route_graph');
    if (error) throw error;
    // Mis à jour à chaque appel réussi : le secours hors-ligne reste le
    // dernier réseau vraiment vu, jamais un instantané figé au premier lancement.
    saveNetworkCache(data);
    return data;
  } catch (err) {
    // Hors-ligne (ou Supabase injoignable) : on retombe sur le dernier
    // réseau connu plutôt que de bloquer tout le planificateur d'itinéraire.
    const cached = await loadNetworkCache();
    if (cached) return cached;
    throw err;
  }
}

// Horaires de toutes les lignes, pour le planificateur (services/journey.ts).
// Même secours hors ligne que le réseau ; sans aucune donnée, on renvoie une
// liste vide — aucune ligne n'est alors écartée.
export async function getLineSchedules(): Promise<ScheduleRow[]> {
  try {
    const { data, error } = await supabase.from('lines').select('id, hours_label, schedule_estimated');
    if (error) throw error;
    saveSchedulesCache(data);
    return data;
  } catch {
    return (await loadSchedulesCache()) ?? [];
  }
}

// Tous les arrêts desservis du réseau, avec leurs lignes — ce que la carte
// d'accueil affiche. Tirés du même appel que le planificateur (et de la même
// copie hors ligne) : chaque téléphone voit exactement les mêmes arrêts, aux
// mêmes positions, où qu'il se trouve. Auparavant la carte ne montrait que
// les arrêts à 3 km de l'utilisateur, si bien que deux appareils à deux
// endroits différents n'affichaient pas les mêmes arrêts.
export async function getNetworkStops(): Promise<Stop[]> {
  const rows = await getRouteGraph();
  const byId = new Map<string, Stop & { lines: string[]; operator_colors: string[] }>();
  for (const row of rows) {
    let stop = byId.get(row.stop_id);
    if (!stop) {
      stop = {
        id: row.stop_id,
        name: row.stop_name,
        latitude: row.latitude,
        longitude: row.longitude,
        lines: [],
        operator_colors: [],
      };
      byId.set(row.stop_id, stop);
    }
    if (!stop.lines.includes(row.line_code)) stop.lines.push(row.line_code);
    if (!stop.operator_colors.includes(row.operator_color)) stop.operator_colors.push(row.operator_color);
  }
  const collator = new Intl.Collator('fr', { numeric: true });
  for (const stop of byId.values()) stop.lines.sort(collator.compare);
  return [...byId.values()];
}

export type NetworkLine = {
  id: string;
  code: string;
  name: string;
  color: string;
  operatorShortName: string;
};

// Toutes les lignes du réseau, de la même source que la carte et le
// planificateur (et donc disponibles hors ligne).
export async function getNetworkLines(): Promise<NetworkLine[]> {
  const rows = await getRouteGraph();
  const byId = new Map<string, NetworkLine>();
  for (const row of rows) {
    if (byId.has(row.line_id)) continue;
    byId.set(row.line_id, {
      id: row.line_id,
      code: row.line_code,
      name: row.line_name,
      color: row.line_color ?? row.operator_color,
      operatorShortName: row.operator_short_name,
    });
  }
  const collator = new Intl.Collator('fr', { numeric: true });
  return [...byId.values()].sort(
    (a, b) => collator.compare(a.operatorShortName, b.operatorShortName) || collator.compare(a.code, b.code)
  );
}
