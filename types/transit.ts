export type Operator = {
  id: string;
  name: string;
  short_name: string;
  color: string;
};

export type Line = {
  id: string;
  operator_id: string;
  code: string;
  name: string;
  color: string | null;
  fare_fcfa?: number;
  /** Amplitude horaire lisible, ex. "Lun-Dim · 6h-21h" — absente si inconnue. */
  hours_label?: string | null;
  /** Fréquence de passage lisible, ex. "Toutes les 6 min" — absente si inconnue. */
  frequency_label?: string | null;
  /** Faux seulement pour un horaire confirmé par l'exploitant (voir schema.sql). */
  schedule_estimated?: boolean;
};

export type Stop = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  distance_meters?: number;
  /** Vrai pour un lieu (mairie, hôpital…) qui n'est pas un arrêt du réseau. */
  isPlace?: boolean;
  /** Commune / quartier, pour les lieux. */
  subtitle?: string;
  /** Catégorie OSM simplifiée : hospital, townhall, market, school… */
  category?: string;
  lines?: string[];
  operator_colors?: string[];
};

export type Trip = {
  id: string;
  originLabel: string;
  destinationLabel: string;
  isSaved: boolean;
  createdAt: string;
};

// Une ligne (ligne_id, arrêt, séquence...) du réseau complet, renvoyée par
// la fonction PostGIS `get_route_graph` — utilisée pour construire le graphe
// du planificateur d'itinéraire (voir services/routing.ts).
export type RouteGraphRow = {
  line_id: string;
  line_code: string;
  line_name: string;
  line_color: string | null;
  fare_fcfa: number;
  operator_short_name: string;
  operator_color: string;
  stop_id: string;
  stop_name: string;
  latitude: number;
  longitude: number;
  sequence: number;
};

export type LatLng = { latitude: number; longitude: number };

export type RideSegment = {
  type: 'ride';
  lineId: string;
  lineCode: string;
  lineName: string;
  lineColor: string;
  operatorShortName: string;
  fareFcfa: number;
  boardStopId: string;
  boardStopName: string;
  alightStopId: string;
  alightStopName: string;
  stopsCount: number;
  minutes: number;
  path: LatLng[];
};

export type WalkSegment = {
  type: 'walk';
  fromStopId: string;
  fromStopName: string;
  toStopId: string;
  toStopName: string;
  minutes: number;
  path: LatLng[];
};

export type TripSegment = RideSegment | WalkSegment;

export type TripPlan = {
  totalMinutes: number;
  totalFareFcfa: number;
  totalWalkMinutes: number;
  segments: TripSegment[];
};

// Une option de trajet parmi lesquelles choisir (écran "Choisir un trajet") —
// la première option renvoyée par `planTripOptions` est la recommandée
// (la plus rapide).
export type TripOption = {
  plan: TripPlan;
  recommended: boolean;
};
