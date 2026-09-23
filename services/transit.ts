import { supabase } from './supabase';
import { Line, Operator, RouteGraphRow, Stop } from '../types/transit';
import { loadNetworkCache, saveNetworkCache } from './offlineCache';

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
