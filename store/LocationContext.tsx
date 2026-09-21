import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, Linking } from 'react-native';
import * as Location from 'expo-location';

// Source unique de la position de l'utilisateur, partagée par la carte et le
// planificateur.
//
// Pourquoi un fournisseur plutôt qu'un appel dans chaque écran : un seul
// abonnement GPS pour toute l'app (moins de batterie), un seul endroit où
// gérer les cas réels qu'un simulateur ne montre jamais — autorisation
// refusée, localisation coupée dans le téléphone, position approximative,
// retour depuis les Réglages.

export type LocationStatus =
  | 'checking' // vérification en cours, au lancement
  | 'needs-permission' // jamais demandée : la carte déclenchera la demande
  | 'denied' // refusée (sur iOS, seule la page Réglages peut la rétablir)
  | 'services-off' // localisation désactivée dans le téléphone
  | 'locating' // autorisée, en attente d'une première position
  | 'ready';

export type UserPosition = {
  latitude: number;
  longitude: number;
  /** Rayon d'incertitude en mètres, tel que rapporté par le téléphone. */
  accuracy: number | null;
  /** Cap de déplacement en degrés (0 = nord), ou null à l'arrêt / si inconnu. */
  heading: number | null;
  timestamp: number;
};

type LocationContextValue = {
  status: LocationStatus;
  position: UserPosition | null;
  /** Faux si l'utilisateur n'a accordé qu'une position approximative (iOS 14+). */
  precise: boolean;
  /**
   * Demande l'autorisation via la boîte de dialogue du système — ou, si elle
   * a déjà été refusée, ouvre les Réglages de l'app, seul endroit où iOS
   * permet de revenir sur ce choix.
   */
  request: () => Promise<void>;
};

const LocationContext = createContext<LocationContextValue | undefined>(undefined);

function toPosition(loc: Location.LocationObject): UserPosition {
  return {
    latitude: loc.coords.latitude,
    longitude: loc.coords.longitude,
    accuracy: loc.coords.accuracy ?? null,
    heading:
      loc.coords.heading != null && loc.coords.heading >= 0 ? loc.coords.heading : null,
    timestamp: loc.timestamp,
  };
}

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<LocationStatus>('checking');
  const [position, setPosition] = useState<UserPosition | null>(null);
  const [precise, setPrecise] = useState(true);

  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);
  // Empêche deux démarrages simultanés (lancement + retour au premier plan) :
  // l'abonnement n'existe qu'après un `await`, donc le tester ne suffit pas.
  const startingRef = useRef(false);

  const stopWatching = useCallback(() => {
    subscriptionRef.current?.remove();
    subscriptionRef.current = null;
  }, []);

  const startWatching = useCallback(async () => {
    if (subscriptionRef.current || startingRef.current) return;
    startingRef.current = true;
    try {
      // Affichage immédiat : la dernière position connue du téléphone, pour
      // ne pas faire attendre l'utilisateur pendant que le GPS s'accroche
      // (plusieurs secondes en intérieur).
      const last = await Location.getLastKnownPositionAsync({
        maxAge: 5 * 60_000,
        requiredAccuracy: 1000,
      }).catch(() => null);
      if (last) {
        setPosition((current) => current ?? toPosition(last));
        setStatus('ready');
      }

      // Puis le suivi continu, en précision maximale.
      subscriptionRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          distanceInterval: 5,
          timeInterval: 2000,
        },
        (loc) => {
          setPosition(toPosition(loc));
          setStatus('ready');
        }
      );
    } catch {
      // Permission retirée entre-temps : l'évaluation suivante le détectera.
      subscriptionRef.current = null;
    } finally {
      startingRef.current = false;
    }
  }, []);

  // Relit l'état réel du téléphone, sans jamais afficher de boîte de dialogue.
  const evaluate = useCallback(async () => {
    const servicesOn = await Location.hasServicesEnabledAsync().catch(() => true);
    if (!servicesOn) {
      stopWatching();
      setStatus('services-off');
      return;
    }

    const permission = await Location.getForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      stopWatching();
      setPosition(null);
      setStatus(permission.status === 'undetermined' ? 'needs-permission' : 'denied');
      return;
    }

    setPrecise(
      permission.ios?.accuracy !== 'reduced' && permission.android?.accuracy !== 'coarse'
    );
    setStatus((current) => (current === 'ready' ? current : 'locating'));
    startWatching();
  }, [startWatching, stopWatching]);

  const request = useCallback(async () => {
    const servicesOn = await Location.hasServicesEnabledAsync().catch(() => true);
    if (!servicesOn) {
      await Linking.openSettings();
      return;
    }

    const permission = await Location.getForegroundPermissionsAsync();
    if (permission.status === 'granted') {
      await evaluate();
      return;
    }
    if (permission.canAskAgain) {
      await Location.requestForegroundPermissionsAsync();
      await evaluate();
      return;
    }
    // Refus définitif : iOS ne réaffiche jamais la boîte de dialogue.
    await Linking.openSettings();
  }, [evaluate]);

  useEffect(() => {
    evaluate();

    // Au retour dans l'app — typiquement après être passé par les Réglages —
    // on relit l'autorisation : sans ça, l'utilisateur qui vient d'activer
    // la localisation ne verrait rien changer avant de relancer l'app.
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') evaluate();
    });

    return () => {
      appState.remove();
      stopWatching();
    };
  }, [evaluate, stopWatching]);

  const value = useMemo<LocationContextValue>(
    () => ({ status, position, precise, request }),
    [status, position, precise, request]
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useUserLocation(): LocationContextValue {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useUserLocation must be used within a LocationProvider');
  return ctx;
}
