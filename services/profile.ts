import { supabase } from './supabase';
import { User } from '../types/auth';

// Accès à la table `profiles` de Supabase : les infos propres à Yoonbi
// (nom, ville) pour un compte Supabase Auth. Le téléphone n'y est pas
// stocké — il vient déjà de `auth.users` (session.user.phone).

type ProfileRow = {
  id: string;
  full_name: string;
  city: string | null;
  created_at: string;
};

function fromRow(row: ProfileRow, phone: string): User {
  return {
    id: row.id,
    phone,
    fullName: row.full_name,
    city: row.city ?? undefined,
    createdAt: row.created_at,
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
