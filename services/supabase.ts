import 'react-native-url-polyfill/auto';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Supabase non configuré : renseigne EXPO_PUBLIC_SUPABASE_URL et ' +
      'EXPO_PUBLIC_SUPABASE_ANON_KEY dans un fichier .env (voir .env.example).'
  );
}

// Juste après un rafraîchissement de session (typiquement à l'ouverture de
// l'app), le serveur de données de Supabase peut juger le nouveau jeton
// « émis dans le futur » (PGRST303) : ses horloges et celles du serveur
// d'authentification diffèrent d'une seconde. La requête redevient valide un
// instant plus tard, donc on la rejoue une fois au lieu d'échouer — sinon la
// carte s'ouvrait sans aucun arrêt.
const CLOCK_SKEW_RETRY_MS = 1500;

const fetchWithClockSkewRetry: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  if (response.status !== 401) return response;
  const body = await response.clone().text();
  if (!body.includes('PGRST303')) return response;
  await new Promise((resolve) => setTimeout(resolve, CLOCK_SKEW_RETRY_MS));
  return fetch(input, init);
};

// Vraie authentification Supabase (téléphone + OTP) : la session (et son
// rafraîchissement automatique) est gérée par supabase-js lui-même, stockée
// via AsyncStorage — plus besoin de la persister à la main.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: fetchWithClockSkewRetry },
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Supabase recommande de mettre en pause le rafraîchissement automatique du
// token quand l'app est en arrière-plan, pour ne pas consommer de requêtes
// inutiles, et de le relancer au retour au premier plan.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
