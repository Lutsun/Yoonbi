// Estimation simple du temps de trajet à vol d'oiseau. Ce n'est pas un
// calcul d'itinéraire réel (pas encore de moteur de routage) — juste une
// indication utile en attendant, clairement présentée comme une estimation.

const AVERAGE_BUS_SPEED_KMH = 18; // vitesse moyenne réaliste en ville, arrêts compris

export function distanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function estimateTripMinutes(km: number): number {
  return Math.max(3, Math.round((km / AVERAGE_BUS_SPEED_KMH) * 60));
}

export function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

// Un trajet à 0 FCFA n'est pas une donnée manquante : c'est un itinéraire
// entièrement à pied (pas de bus pris). « 0 FCFA » tout seul ressemble à
// une erreur ; on le dit explicitement pour que ce soit rassurant.
// `estimated` : le prix est une estimation (DDD, AFTU — voir services/fares.ts),
// annoncée par « ≈ » pour ne jamais présenter un prix approché comme exact.
export function formatFare(totalFareFcfa: number, unit: 'FCFA' | 'F' = 'FCFA', estimated = false): string {
  return totalFareFcfa > 0 ? `${estimated ? '≈ ' : ''}${totalFareFcfa} ${unit}` : 'Gratuit (à pied)';
}
