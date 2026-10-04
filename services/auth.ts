import { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { toE164 } from '../utils/phone';

// Authentification par téléphone + code SMS, via le vrai système d'auth de
// Supabase (Authentication > Providers > Phone). En développement, on
// utilise les "Test Phone Numbers" de Supabase (numéros + code fixes,
// configurés dans le dashboard) pour ne pas dépendre d'un fournisseur SMS
// payant — voir README.md pour la marche à suivre.

export async function sendOtp(rawPhone: string): Promise<void> {
  const phone = toE164(rawPhone);
  const { error } = await supabase.auth.signInWithOtp({ phone });
  if (error) throw error;
}

export async function verifyOtp(
  rawPhone: string,
  code: string
): Promise<{ session: Session | null }> {
  const phone = toE164(rawPhone);
  const { data, error } = await supabase.auth.verifyOtp({
    phone,
    token: code,
    type: 'sms',
  });
  if (error) throw error;
  return { session: data.session };
}

// Traduit une erreur d'authentification en message affichable.
//
// Sans ça, tout échouait sur le même « vérifie ta connexion », qui laissait
// croire à un problème de numéro alors que la cause pouvait être tout autre
// (serveur injoignable, numéro non autorisé à recevoir un code, quota...).
export function describeAuthError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const message = raw.toLowerCase();
  const status = typeof (error as { status?: unknown })?.status === 'number'
    ? (error as { status: number }).status
    : undefined;

  // Serveur injoignable : coupure réseau, ou projet Supabase en pause.
  if (
    message.includes('network request failed') ||
    message.includes('failed to fetch') ||
    message.includes('could not resolve') ||
    status === 0
  ) {
    return __DEV__
      ? 'Serveur injoignable. Vérifiez votre connexion, et que le projet Supabase n’est pas en pause.'
      : 'Service momentanément indisponible. Réessayez dans un instant.';
  }

  // Trop de demandes de code pour ce numéro.
  if (status === 429 || message.includes('rate limit') || message.includes('too many')) {
    return 'Trop de demandes. Attendez une minute avant de redemander un code.';
  }

  // L'envoi du SMS a échoué côté fournisseur : en pratique, un numéro qui
  // n'est pas autorisé à recevoir de code sur la configuration actuelle.
  if (message.includes('sms') || message.includes('provider')) {
    return __DEV__
      ? 'Ce numéro ne peut pas recevoir de code : ajoutez-le aux numéros de test Supabase (Authentication → Providers → Phone), ou configurez un fournisseur SMS.'
      : 'Ce numéro ne peut pas recevoir de code pour le moment.';
  }

  if (message.includes('invalid') && message.includes('phone')) {
    return 'Numéro invalide. Vérifiez les 9 chiffres.';
  }

  if (message.includes('expired') || message.includes('token')) {
    return 'Code incorrect ou expiré.';
  }

  return 'Impossible d’envoyer le code. Réessayez dans un instant.';
}
