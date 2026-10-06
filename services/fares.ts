// Prix d'un trajet en bus, au plus près des tarifs réels de chaque réseau.
// Chaque bus emprunté se paie : une correspondance coûte un ticket de plus
// (aucun des trois réseaux n'a de ticket unique avec correspondance).
//
// - Sunu BRT : tarif zonal OFFICIEL (sunubrt.sn, « Gamme tarifaire ») —
//   400 F dans une même zone, 500 F dès qu'on franchit une ou deux limites.
//   Trois zones, autour des trois pôles d'échange : Guédiawaye, Grand Médine
//   et Petersen. sunubrt.sn ne publie pas la liste des gares par zone : le
//   découpage ci-dessous suit les pôles (Préfecture → Parcelles, Croisement 22
//   → Khar Yalla, Liberté 6 → Papa Gueye Fall) et reste à confirmer auprès de
//   SunuBRT (818 55 55 55). Une gare inconnue compte comme « toutes zones ».
// - Dakar Dem Dikk : « environ 150 à 250 F selon la distance et la ligne »
//   en ville (senego.com, octobre 2026), sans grille publiée par arrêt.
// - Tata AFTU : 100 à 150 F la section, 150 F la première section depuis la
//   dernière hausse et 300 F jusqu'au centre-ville (senego.com, sencampus).
//
// Pour DDD et AFTU, le prix est donc ESTIMÉ selon la distance, à l'intérieur
// de ces fourchettes publiées — et l'app l'affiche avec « ≈ ».

type Zone = 'guediawaye' | 'grand-medine' | 'petersen';

const BRT_ZONES: Record<string, Zone> = {
  'Préfecture de Guédiawaye': 'guediawaye',
  'Gueule Tapée': 'guediawaye',
  'Golf Nord': 'guediawaye',
  'Fith Mith': 'guediawaye',
  'Dalal Jamm': 'guediawaye',
  'Golf Sud': 'guediawaye',
  Ndingala: 'guediawaye',
  Parcelles: 'guediawaye',
  'Croisement 22': 'grand-medine',
  'Police des Parcelles': 'grand-medine',
  'Grand Médine': 'grand-medine',
  'Cardinal Hyancinthe Thiandoum': 'grand-medine',
  'Scat Urbam': 'grand-medine',
  'Khar Yalla': 'grand-medine',
  'Liberté 6': 'petersen',
  'Liberté 5': 'petersen',
  'Sacré Coeur': 'petersen',
  'Liberté 1': 'petersen',
  'Grand Dakar': 'petersen',
  'Dial Diop': 'petersen',
  'Place de la Nation': 'petersen',
  'Grande Mosquée': 'petersen',
  'Papa Gueye Fall': 'petersen',
  Petersen: 'petersen',
};

const BRT_ONE_ZONE = 400;
const BRT_ALL_ZONES = 500;

// Paliers de distance (km parcourus dans le bus) → prix, dans les fourchettes
// publiées ci-dessus.
const DDD_BANDS: [number, number][] = [
  [6, 150],
  [12, 200],
  [Infinity, 250],
];
const AFTU_BANDS: [number, number][] = [
  [4, 150],
  [8, 200],
  [12, 250],
  [Infinity, 300],
];

function byDistance(bands: [number, number][], km: number): number {
  return bands.find(([max]) => km <= max)![1];
}

export type RideFare = { fareFcfa: number; estimated: boolean };

export function rideFare(params: {
  operatorShortName: string;
  boardStopName: string;
  alightStopName: string;
  rideKm: number;
  /** Prix enregistré pour la ligne, pour un réseau dont on ne connaît pas la grille. */
  lineFareFcfa: number;
}): RideFare {
  const { operatorShortName, boardStopName, alightStopName, rideKm, lineFareFcfa } = params;
  switch (operatorShortName) {
    case 'BRT': {
      const from = BRT_ZONES[boardStopName];
      const to = BRT_ZONES[alightStopName];
      if (!from || !to) return { fareFcfa: BRT_ALL_ZONES, estimated: true };
      return { fareFcfa: from === to ? BRT_ONE_ZONE : BRT_ALL_ZONES, estimated: false };
    }
    case 'DDD':
      return { fareFcfa: byDistance(DDD_BANDS, rideKm), estimated: true };
    case 'AFTU':
      return { fareFcfa: byDistance(AFTU_BANDS, rideKm), estimated: true };
    default:
      return { fareFcfa: lineFareFcfa, estimated: true };
  }
}

/** « 400 F », « ≈ 350 F » — `unit` comme formatFare (utils/eta.ts). */
export function fareLabel(fareFcfa: number, estimated: boolean | undefined, unit: 'FCFA' | 'F' = 'FCFA'): string {
  return `${estimated ? '≈ ' : ''}${fareFcfa} ${unit}`;
}
