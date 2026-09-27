export type SavedPlace = { label: string; latitude: number; longitude: number };

export type User = {
  id: string;
  phone: string;
  fullName: string;
  city?: string;
  createdAt: string;
  home?: SavedPlace;
  work?: SavedPlace;
};
