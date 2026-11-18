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

// TER : tarif zonal officiel (2e classe). Zone 1 de Dakar à Thiaroye, zone 2 de
// Yeumbeul à Bargny, zone 3 Diamniadio — 500 F par zone traversée. L'AIBD a
// sa propre grille : 4 000 F depuis la zone 1, 3 500 F depuis la zone 2,
// 3 000 F depuis Diamniadio (SETER, tarifs au 12 octobre 2026).
const TER_ZONES: Record<string, number> = {
  'Gare TER Dakar': 1,
  'Gare TER Colobane': 1,
  'Gare TER Hann': 1,
  'Gare TER Dalifort': 1,
  'Gare TER Baux Maraîchers': 1,
  'Gare TER Pikine': 1,
  'Gare TER Thiaroye': 1,
  'Gare TER Yeumbeul': 2,
  'Gare TER Keur Mbaye Fall': 2,
  'Gare TER PNR': 2,
  'Gare TER Rufisque': 2,
  'Gare TER Bargny': 2,
  'Gare TER Diamniadio': 3,
};
const TER_AIBD = 'Gare TER AIBD';
const TER_PER_ZONE = 500;
const TER_TO_AIBD: Record<number, number> = { 1: 4000, 2: 3500, 3: 3000 };

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
    case 'TER': {
      const other = boardStopName === TER_AIBD ? alightStopName : alightStopName === TER_AIBD ? boardStopName : null;
      if (other !== null) {
        const zone = TER_ZONES[other];
        return zone ? { fareFcfa: TER_TO_AIBD[zone], estimated: false } : { fareFcfa: TER_TO_AIBD[1], estimated: true };
      }
      const from = TER_ZONES[boardStopName];
      const to = TER_ZONES[alightStopName];
      if (!from || !to) return { fareFcfa: 1500, estimated: true };
      return { fareFcfa: (Math.abs(from - to) + 1) * TER_PER_ZONE, estimated: false };
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
