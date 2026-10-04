import AsyncStorage from '@react-native-async-storage/async-storage';

import { RouteGraphRow, Stop, TripPlan } from '../types/transit';

// Deux caches hors-ligne, tous deux volontairement simples (AsyncStorage,
// pas de base locale) : le réseau complet, pour que le planificateur
// fonctionne encore sans réseau, et le dernier trajet, pour que le guidage
// démarré en ligne puisse continuer si la connexion tombe en route — le GPS,
// lui, ne dépend d'aucun réseau.

const NETWORK_KEY = 'yoonbi_network_cache_v1';
const LAST_TRIP_KEY = 'yoonbi_last_trip_v1';

// Au-delà de cette ancienneté, le réseau mis en cache n'est plus proposé
// comme secours : mieux vaut un échec explicite qu'un plan basé sur des
// lignes qui ont pu changer depuis longtemps.
const NETWORK_CACHE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000; // 14 jours
// Passé ce délai, on ne propose plus de reprendre le dernier trajet : il y a
// de fortes chances qu'il soit terminé ou obsolète.
const LAST_TRIP_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 heures

type NetworkCache = { savedAt: number; rows: RouteGraphRow[] };

export async function saveNetworkCache(rows: RouteGraphRow[]): Promise<void> {
  try {
    const payload: NetworkCache = { savedAt: Date.now(), rows };
    await AsyncStorage.setItem(NETWORK_KEY, JSON.stringify(payload));
  } catch {
    // Le cache est un confort, jamais une condition de fonctionnement.
  }
}

export async function loadNetworkCache(): Promise<RouteGraphRow[] | null> {
  try {
    const raw = await AsyncStorage.getItem(NETWORK_KEY);
    if (!raw) return null;
    const { savedAt, rows }: NetworkCache = JSON.parse(raw);
    if (Date.now() - savedAt > NETWORK_CACHE_MAX_AGE_MS) return null;
    return rows;
  } catch {
    return null;
  }
}

export type LastTripCache = {
  savedAt: number;
  origin: Stop;
  destination: Stop;
  plan: TripPlan;
};

export async function saveLastTrip(trip: Omit<LastTripCache, 'savedAt'>): Promise<void> {
  try {
    const payload: LastTripCache = { ...trip, savedAt: Date.now() };
    await AsyncStorage.setItem(LAST_TRIP_KEY, JSON.stringify(payload));
  } catch {
    // idem : un échec d'écriture du cache ne doit jamais interrompre le guidage.
  }
}

export async function loadLastTrip(): Promise<LastTripCache | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_TRIP_KEY);
    if (!raw) return null;
    const cached: LastTripCache = JSON.parse(raw);
    if (Date.now() - cached.savedAt > LAST_TRIP_MAX_AGE_MS) return null;
    return cached;
  } catch {
    return null;
  }
}

export async function clearLastTrip(): Promise<void> {
  try {
    await AsyncStorage.removeItem(LAST_TRIP_KEY);
  } catch {
    // rien à faire : au pire, le prochain chargement dépassera juste l'âge max.
  }
}

// Tracés réels des lignes (table line_shapes) — même logique que le réseau :
// mis à jour à chaque chargement réussi, relu seulement hors ligne.
const SHAPES_KEY = 'yoonbi_line_shapes_v1';

export type ShapeRow = { line_id: string; coords: [number, number][] };

export async function saveShapesCache(rows: ShapeRow[]): Promise<void> {
  try {
    await AsyncStorage.setItem(SHAPES_KEY, JSON.stringify(rows));
  } catch {
    // confort uniquement
  }
}

// Horaires des lignes — pour qu'hors ligne aussi, le planificateur écarte
// une ligne qui ne circule pas à cette heure.
const SCHEDULES_KEY = 'yoonbi_line_schedules_v1';

export type ScheduleRow = { id: string; hours_label: string | null; schedule_estimated: boolean };

export async function saveSchedulesCache(rows: ScheduleRow[]): Promise<void> {
  try {
    await AsyncStorage.setItem(SCHEDULES_KEY, JSON.stringify(rows));
  } catch {
    // confort uniquement
  }
}

export async function loadSchedulesCache(): Promise<ScheduleRow[] | null> {
  try {
    const raw = await AsyncStorage.getItem(SCHEDULES_KEY);
    return raw ? (JSON.parse(raw) as ScheduleRow[]) : null;
  } catch {
    return null;
  }
}

export async function loadShapesCache(): Promise<ShapeRow[] | null> {
  try {
    const raw = await AsyncStorage.getItem(SHAPES_KEY);
    return raw ? (JSON.parse(raw) as ShapeRow[]) : null;
  } catch {
    return null;
  }
}
