import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { snapPlanToRoads } from '../services/roadPath';
import { clearLastTrip, LastTripCache, loadLastTrip, saveLastTrip } from '../services/offlineCache';
import { Stop, TripOption, TripPlan } from '../types/transit';

// Trajet actuellement affiché sur la carte d'accueil, calculé par le
// planificateur d'itinéraire (app/(modals)/itinerary.tsx). Un contexte
// simple suffit : un seul trajet actif à la fois, partagé entre l'écran
// de recherche et la carte qui l'affiche.
export type ActiveTrip = {
  origin: Stop;
  destination: Stop;
  plan: TripPlan;
};

// Options calculées par itinerary.tsx, en attente d'un choix sur l'écran
// "Choisir un trajet" (choose-trip.tsx).
export type PendingTrip = {
  origin: Stop;
  destination: Stop;
  options: TripOption[];
};

// Option choisie sur choose-trip.tsx, en attente de confirmation sur
// l'écran "Votre itinéraire" (trip-detail.tsx) avant de démarrer le guide.
export type PreviewTrip = {
  origin: Stop;
  destination: Stop;
  plan: TripPlan;
};

type TripContextValue = {
  activeTrip: ActiveTrip | null;
  setActiveTrip: (trip: ActiveTrip) => void;
  clearActiveTrip: () => void;
  /**
   * Trajet retrouvé au lancement de l'app (moins de 6 h, non terminé) —
   * permet de reprendre le guidage hors-ligne si la connexion a coupé.
   */
  resumableTrip: LastTripCache | null;
  resumeLastTrip: () => void;
  dismissResumableTrip: () => void;
  pendingTrip: PendingTrip | null;
  setPendingTrip: (trip: PendingTrip) => void;
  previewTrip: PreviewTrip | null;
  setPreviewTrip: (trip: PreviewTrip) => void;
};

const TripContext = createContext<TripContextValue | undefined>(undefined);

export function TripProvider({ children }: { children: React.ReactNode }) {
  const [activeTrip, setActiveTripState] = useState<ActiveTrip | null>(null);
  const [pendingTrip, setPendingTripState] = useState<PendingTrip | null>(null);
  const [previewTrip, setPreviewTripState] = useState<PreviewTrip | null>(null);
  const [resumableTrip, setResumableTrip] = useState<LastTripCache | null>(null);
  const tripVersion = useRef(0);

  // Au lancement, propose de reprendre un trajet interrompu (l'app tuée ou
  // le réseau perdu en cours de route) — jamais un trajet déjà terminé.
  useEffect(() => {
    loadLastTrip().then((cached) => setResumableTrip(cached));
  }, []);

  const value = useMemo<TripContextValue>(
    () => ({
      activeTrip,
      setActiveTrip: (trip) => {
        // Le guidage démarre tout de suite sur le tracé droit ; il est
        // remplacé par le tracé suivant les rues dès qu'il est calculé, et
        // c'est ce tracé-là qu'on garde en cache (utilisable hors ligne).
        const version = ++tripVersion.current;
        setResumableTrip(null);
        setActiveTripState(trip);
        saveLastTrip(trip);
        snapPlanToRoads(trip.plan).then((plan) => {
          if (version === tripVersion.current) {
            const next = { ...trip, plan };
            setActiveTripState(next);
            saveLastTrip(next);
          }
        });
      },
      clearActiveTrip: () => {
        tripVersion.current += 1;
        setActiveTripState(null);
        clearLastTrip();
      },
      resumableTrip,
      resumeLastTrip: () => {
        if (!resumableTrip) return;
        tripVersion.current += 1;
        setActiveTripState({
          origin: resumableTrip.origin,
          destination: resumableTrip.destination,
          plan: resumableTrip.plan,
        });
        setResumableTrip(null);
      },
      dismissResumableTrip: () => {
        setResumableTrip(null);
        clearLastTrip();
      },
      pendingTrip,
      setPendingTrip: (trip) => setPendingTripState(trip),
      previewTrip,
      setPreviewTrip: (trip) => setPreviewTripState(trip),
    }),
    [activeTrip, pendingTrip, previewTrip, resumableTrip]
  );

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}

export function useTrip() {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error('useTrip must be used within a TripProvider');
  return ctx;
}
