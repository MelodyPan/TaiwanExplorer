export type PlaceCategory =
  | 'ATTRACTION'
  | 'FOOD'
  | 'CAFE'
  | 'HOTEL'
  | 'CULTURE'
  | 'NATURE';

export interface Place {
  id: number;

  name: string;

  category: PlaceCategory;

  county: string;

  district: string;

  latitude: number;

  longitude: number;

  address?: string;

  description?: string;

  imageUrl?: string;

  websiteUrl?: string;

  googleMapUrl?: string;

  tags?: string[];
}