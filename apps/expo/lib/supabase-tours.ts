import { supabase } from './supabase';

export type TourDifficulty = 'leicht' | 'mittel' | 'sportlich';
export type TourHoursBucket = '2h' | '4h' | 'tag' | 'mehrtag';

export interface TourRecord {
  id: string;
  slug: string;
  title_de: string;
  subtitle_de: string | null;
  description_de: string | null;
  cover_image_url: string | null;
  start_lat: number | null;
  start_lon: number | null;
  start_label_de: string | null;
  distance_km: number | null;
  duration_min: number | null;
  elevation_gain_m: number | null;
  surface_de: string | null;
  difficulty: TourDifficulty;
  categories: string[];
  hours_bucket: TourHoursBucket | null;
  is_sternfahrt: boolean;
  is_meckys_tipp_today: boolean;
  ferry_combo: boolean;
  bus_combo: boolean;
  has_swim_stop: boolean;
  has_eis_stop: boolean;
  family_friendly: boolean;
  bad_weather_alternative: boolean;
  season_de: string | null;
  best_start_time_de: string | null;
  return_options_de: string | null;
  gpx_url: string | null;
  komoot_url: string | null;
  alltrails_url: string | null;
  highlights_de: string[];
  warnings_de: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TourStopRecord {
  id: string;
  tour_id: string;
  stop_order: number;
  name_de: string;
  description_de: string | null;
  lat: number | null;
  lon: number | null;
  km_from_start: number | null;
  stop_type: string | null;
  poi_id: string | null;
}

export const DIFFICULTY_LABELS_DE: Record<TourDifficulty, string> = {
  leicht: 'Leicht',
  mittel: 'Mittel',
  sportlich: 'Sportlich',
};

export const DIFFICULTY_COLORS: Record<TourDifficulty, string> = {
  leicht: '#2B9348',
  mittel: '#FFB703',
  sportlich: '#D62828',
};

export const HOURS_LABELS_DE: Record<TourHoursBucket, string> = {
  '2h': '~ 2 h',
  '4h': '~ 4 h',
  tag: 'Tag',
  mehrtag: 'Mehrtag',
};

export const TOUR_CATEGORY_LABELS_DE: Record<string, string> = {
  familie: 'Familie',
  sonnenuntergang: 'Sonnenuntergang',
  sonnenaufgang: 'Sonnenaufgang',
  faehre_kombi: 'Schiff-Kombi',
  bus_kombi: 'Bus-Kombi',
  badewetter: 'Badewetter',
  schlechtwetter: 'Schlechtwetter',
  wildlife: 'Wildlife',
  altstadt: 'Altstadt',
  kultur: 'Kultur',
  naturpark: 'Nationalpark',
  flach: 'Flach',
  hafen: 'Hafen',
  rundtour: 'Rundtour',
  einweg: 'Einweg',
  kinder: 'Kinder',
  wandern: 'Wandern',
  rad: 'Rad',
};

export interface TourFilters {
  hours_bucket?: TourHoursBucket;
  category?: string;
  family_friendly?: boolean;
  bad_weather_alternative?: boolean;
  ferry_combo?: boolean;
  is_sternfahrt?: boolean;
  difficulty?: TourDifficulty;
  q?: string;
}

export async function fetchTours(filters: TourFilters = {}): Promise<TourRecord[]> {
  let query = supabase.from('tours').select('*').eq('is_active', true);
  if (filters.hours_bucket) query = query.eq('hours_bucket', filters.hours_bucket);
  if (filters.family_friendly != null)
    query = query.eq('family_friendly', filters.family_friendly);
  if (filters.bad_weather_alternative != null)
    query = query.eq('bad_weather_alternative', filters.bad_weather_alternative);
  if (filters.ferry_combo != null) query = query.eq('ferry_combo', filters.ferry_combo);
  if (filters.is_sternfahrt != null) query = query.eq('is_sternfahrt', filters.is_sternfahrt);
  if (filters.difficulty) query = query.eq('difficulty', filters.difficulty);
  if (filters.category) query = query.contains('categories', [filters.category]);
  if (filters.q) query = query.ilike('title_de', `%${filters.q}%`);
  const { data, error } = await query.order('distance_km', { ascending: true });
  if (error) {
    console.error('Error fetching tours:', error);
    return [];
  }
  return (data || []) as TourRecord[];
}

export async function fetchTourBySlug(slug: string): Promise<TourRecord | null> {
  const { data, error } = await supabase.from('tours').select('*').eq('slug', slug).single();
  if (error) {
    console.error('Error fetching tour:', error);
    return null;
  }
  return data as TourRecord;
}

export async function fetchTourStops(tourId: string): Promise<TourStopRecord[]> {
  const { data, error } = await supabase
    .from('tour_stops')
    .select('*')
    .eq('tour_id', tourId)
    .order('stop_order', { ascending: true });
  if (error) {
    console.error('Error fetching tour stops:', error);
    return [];
  }
  return (data || []) as TourStopRecord[];
}

export async function fetchMeckysTippToday(): Promise<TourRecord | null> {
  const { data, error } = await supabase
    .from('tours')
    .select('*')
    .eq('is_active', true)
    .eq('is_meckys_tipp_today', true)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('Error fetching meckys tipp:', error);
    return null;
  }
  return (data as TourRecord | null) ?? null;
}
