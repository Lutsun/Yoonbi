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
  fare_fcfa: number;
  hours_label: string | null;
  frequency_label: string | null;
  schedule_estimated: boolean;
};

export type Stop = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  line_count: number;
};

export type LineStop = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  sequence: number;
};

export type YoonbiUser = {
  id: string;
  full_name: string;
  city: string | null;
  phone: string;
  created_at: string;
  saved_trips: number;
  favorite_lines: number;
};

export type Stats = {
  operators: number;
  lines: number;
  stops: number;
  users: number;
  saved_trips: number;
  favorite_lines: number;
  orphan_stops: number;
  short_lines: number;
  lines_by_operator: { operator: string; color: string; lines: number }[];
  popular_lines: { code: string; name: string; operator: string; favorites: number }[];
};
