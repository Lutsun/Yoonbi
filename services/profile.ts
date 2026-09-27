import { supabase } from './supabase';
import { SavedPlace, User } from '../types/auth';

// Accès à la table `profiles` de Supabase : les infos propres à Yoonbi
// (nom, ville) pour un compte Supabase Auth. Le téléphone n'y est pas
// stocké — il vient déjà de `auth.users` (session.user.phone).

type ProfileRow = {
  id: string;
  full_name: string;
  city: string | null;
  created_at: string;
  home_label: string | null;
  home_latitude: number | null;
  home_longitude: number | null;
  work_label: string | null;
  work_latitude: number | null;
  work_longitude: number | null;
};

function placeOf(label: string | null, lat: number | null, lng: number | null): SavedPlace | undefined {
  return label != null && lat != null && lng != null ? { label, latitude: lat, longitude: lng } : undefined;
}

function fromRow(row: ProfileRow, phone: string): User {
  return {
    id: row.id,
    phone,
    fullName: row.full_name,
    city: row.city ?? undefined,
    createdAt: row.created_at,
    home: placeOf(row.home_label, row.home_latitude, row.home_longitude),
    work: placeOf(row.work_label, row.work_latitude, row.work_longitude),
  };
}

export async function getProfile(userId: string, phone: string): Promise<User | undefined> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return data ? fromRow(data, phone) : undefined;
}

export async function createProfile(
  userId: string,
  phone: string,
  fullName: string,
  city?: string
): Promise<User> {
  const { data, error } = await supabase
    .from('profiles')
    .insert({ id: userId, full_name: fullName.trim(), city: city?.trim() || null })
    .select('*')
    .single();

  if (error) throw error;
  return fromRow(data, phone);
}

// Enregistre (ou efface, avec `place = null`) le domicile ou le travail de
// l'utilisateur — affichés comme raccourcis sur l'écran d'itinéraire.
export async function setSavedPlace(
  userId: string,
  kind: 'home' | 'work',
  place: SavedPlace | null
): Promise<void> {
  const payload = place
    ? { [`${kind}_label`]: place.label, [`${kind}_latitude`]: place.latitude, [`${kind}_longitude`]: place.longitude }
    : { [`${kind}_label`]: null, [`${kind}_latitude`]: null, [`${kind}_longitude`]: null };

  const { error } = await supabase.from('profiles').update(payload).eq('id', userId);
  if (error) throw error;
}
