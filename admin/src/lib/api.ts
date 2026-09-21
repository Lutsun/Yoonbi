import { supabase } from './supabase';
import type { Line, LineStop, Operator, Stats, Stop, YoonbiUser } from './types';

// Toutes les lectures et écritures de la console passent par ici : les écrans
// ne parlent jamais directement à Supabase.

function fail(error: { message: string; code?: string } | null): void {
  if (!error) return;
  // 42501 = refus des règles de sécurité : message clair plutôt que technique.
  if (error.code === '42501') {
    throw new Error('Action refusée : ce compte n’a pas les droits d’administration.');
  }
  // 23505 = doublon (nom d'arrêt, code de ligne…).
  if (error.code === '23505') {
    throw new Error('Cet élément existe déjà (même nom ou même code).');
  }
  throw new Error(error.message);
}

// Opérateurs ---------------------------------------------------------------

export async function listOperators(): Promise<Operator[]> {
  const { data, error } = await supabase.from('operators').select('*').order('name');
  fail(error);
  return data ?? [];
}

export async function saveOperator(op: Omit<Operator, 'id'> & { id?: string }): Promise<void> {
  const payload = { name: op.name.trim(), short_name: op.short_name.trim(), color: op.color };
  const { error } = op.id
    ? await supabase.from('operators').update(payload).eq('id', op.id)
    : await supabase.from('operators').insert(payload);
  fail(error);
}

export async function deleteOperator(id: string): Promise<void> {
  const { error } = await supabase.from('operators').delete().eq('id', id);
  fail(error);
}

// Lignes ---------------------------------------------------------------------

export async function listLines(): Promise<Line[]> {
  const { data, error } = await supabase.from('lines').select('*').order('code');
  fail(error);
  return data ?? [];
}

export async function getLine(id: string): Promise<Line | null> {
  const { data, error } = await supabase.from('lines').select('*').eq('id', id).maybeSingle();
  fail(error);
  return data;
}

export async function saveLine(line: Omit<Line, 'id'> & { id?: string }): Promise<string> {
  const payload = {
    operator_id: line.operator_id,
    code: line.code.trim(),
    name: line.name.trim(),
    color: line.color || null,
    fare_fcfa: line.fare_fcfa,
  };
  if (line.id) {
    const { error } = await supabase.from('lines').update(payload).eq('id', line.id);
    fail(error);
    return line.id;
  }
  const { data, error } = await supabase.from('lines').insert(payload).select('id').single();
  fail(error);
  return data!.id;
}

export async function deleteLine(id: string): Promise<void> {
  const { error } = await supabase.from('lines').delete().eq('id', id);
  fail(error);
}

export async function getLineStops(lineId: string): Promise<LineStop[]> {
  const { data, error } = await supabase.rpc('get_line_stops', { p_line_id: lineId });
  fail(error);
  return data ?? [];
}

export async function setLineStops(lineId: string, stopIds: string[]): Promise<void> {
  const { error } = await supabase.rpc('admin_set_line_stops', {
    p_line_id: lineId,
    p_stop_ids: stopIds,
  });
  fail(error);
}

export async function countStopsPerLine(): Promise<Map<string, number>> {
  const { data, error } = await supabase.from('line_stops').select('line_id');
  fail(error);
  const counts = new Map<string, number>();
  for (const row of data ?? []) counts.set(row.line_id, (counts.get(row.line_id) ?? 0) + 1);
  return counts;
}

// Arrêts -------------------------------------------------------------------

export async function listStops(): Promise<Stop[]> {
  const { data, error } = await supabase.rpc('admin_list_stops');
  fail(error);
  return data ?? [];
}

export async function saveStop(stop: {
  id?: string;
  name: string;
  latitude: number;
  longitude: number;
}): Promise<string> {
  const { data, error } = await supabase.rpc('admin_save_stop', {
    p_id: stop.id ?? null,
    p_name: stop.name,
    p_lat: stop.latitude,
    p_lng: stop.longitude,
  });
  fail(error);
  return data as string;
}

export async function deleteStop(id: string): Promise<void> {
  const { error } = await supabase.from('stops').delete().eq('id', id);
  fail(error);
}

// Tableau de bord ------------------------------------------------------------

export async function getStats(): Promise<Stats> {
  const { data, error } = await supabase.rpc('admin_stats');
  fail(error);
  return data as Stats;
}

// Utilisateurs ---------------------------------------------------------------
// Lecture seule : supprimer un compte demande l'API Auth Admin (clé
// service_role), qu'on ne met délibérément pas dans une app servie au
// navigateur — ce serait la rendre lisible par n'importe qui.

export async function listUsers(): Promise<YoonbiUser[]> {
  const { data, error } = await supabase.rpc('admin_list_users');
  fail(error);
  return data ?? [];
}
