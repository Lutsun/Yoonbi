import { supabase } from './supabase';
import { loadShapesCache, saveShapesCache, ShapeRow } from './offlineCache';
import { LatLng } from '../types/transit';

// Tracés réels des lignes (table line_shapes, générée depuis OpenStreetMap
// par scripts/build_line_shapes.py) : le chemin exact du bus, au lieu d'une
// route devinée entre deux arrêts. Seules certaines lignes en ont un ; pour
// les autres, le tracé suit les rues arrêt par arrêt (roadPath.ts).

let loaded: Map<string, LatLng[]> | null = null;

function toMap(rows: ShapeRow[]): Map<string, LatLng[]> {
  return new Map(
    rows.map((row) => [
      row.line_id,
      row.coords.map(([longitude, latitude]) => ({ latitude, longitude })),
    ])
  );
}

export async function getLineShapes(): Promise<Map<string, LatLng[]>> {
  if (loaded) return loaded;
  try {
    const { data, error } = await supabase.from('line_shapes').select('line_id, coords');
    if (error) throw error;
    saveShapesCache(data as ShapeRow[]);
    loaded = toMap(data as ShapeRow[]);
    return loaded;
  } catch {
    // Hors ligne, ou table pas encore créée : le dernier jeu connu, sinon
    // aucun — le tracé retombe alors sur les rues, sans rien bloquer. Pas de
    // mémorisation ici : le prochain trajet retentera.
    const cached = await loadShapesCache();
    return cached ? toMap(cached) : new Map();
  }
}
