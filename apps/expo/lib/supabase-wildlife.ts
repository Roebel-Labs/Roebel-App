import { supabase } from './supabase';

export type WildlifeCategory =
  | 'vogel'
  | 'saeugetier'
  | 'reptil'
  | 'amphibie'
  | 'fisch'
  | 'insekt'
  | 'sonstiges';

export interface WildlifeSpecies {
  id: string;
  slug: string;
  name_de: string;
  name_scientific: string | null;
  category: WildlifeCategory;
  is_protected: boolean;
  protect_coordinates: boolean;
  description_de: string | null;
  best_months: number[];
  best_locations_de: string | null;
  image_url: string | null;
  mecky_tipp_de: string | null;
  ornitho_species_code: string | null;
  is_active: boolean;
}

export type AlarmKind = 'sunrise_minus_30' | 'sunset' | 'morning' | 'evening' | 'none';

export interface WildlifeSeasonalEvent {
  id: string;
  species_id: string | null;
  title_de: string;
  description_de: string | null;
  start_month: number;
  end_month: number;
  start_date_hint_de: string | null;
  peak_window_de: string | null;
  best_location_de: string | null;
  alarm_kind: AlarmKind | null;
  trigger_hint: string | null;
  push_message_de: string | null;
  is_active: boolean;
}

export interface WildlifeSighting {
  id: string;
  species_id: string | null;
  observer_wallet: string | null;
  observer_name_de: string | null;
  observed_at: string;
  lat: number;
  lon: number;
  raw_lat: number | null;
  raw_lon: number | null;
  individual_count: number;
  notes_de: string | null;
  photo_url: string | null;
  near_landmark_de: string | null;
  verified_by_mecky: boolean;
  mecky_verification_note_de: string | null;
  ranger_verified: boolean;
  is_visible: boolean;
  helpful_count: number;
  ornitho_cross_posted: boolean;
  ornitho_url: string | null;
  created_at: string;
}

export const WILDLIFE_CATEGORY_LABELS_DE: Record<WildlifeCategory, string> = {
  vogel: 'Vogel',
  saeugetier: 'Säugetier',
  reptil: 'Reptil',
  amphibie: 'Amphibie',
  fisch: 'Fisch',
  insekt: 'Insekt',
  sonstiges: 'Sonstiges',
};

export const MONTH_LABELS_DE = [
  'Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez',
];

export function isInSeason(species: WildlifeSpecies, date = new Date()): boolean {
  if (species.best_months.length === 0) return true;
  return species.best_months.includes(date.getMonth() + 1);
}

export function isEventActive(event: WildlifeSeasonalEvent, date = new Date()): boolean {
  const m = date.getMonth() + 1;
  if (event.start_month <= event.end_month) {
    return m >= event.start_month && m <= event.end_month;
  }
  // wraps year-end (e.g. Dec → Mar)
  return m >= event.start_month || m <= event.end_month;
}

// Fuzz coordinates by ~1-2 km for protected species so exact nest
// locations are never exposed publicly.
export function fuzzCoordinate(lat: number, lon: number): { lat: number; lon: number } {
  const fuzzDeg = 0.012; // ~1.3 km
  const dLat = (Math.random() - 0.5) * fuzzDeg;
  const dLon = (Math.random() - 0.5) * fuzzDeg;
  return { lat: lat + dLat, lon: lon + dLon };
}

// ─── Fetchers ────────────────────────────────────────────────

export async function fetchSpecies(): Promise<WildlifeSpecies[]> {
  const { data, error } = await supabase
    .from('wildlife_species')
    .select('*')
    .eq('is_active', true)
    .order('name_de', { ascending: true });
  if (error) {
    console.error('Error fetching wildlife species:', error);
    return [];
  }
  return (data || []) as WildlifeSpecies[];
}

export async function fetchSeasonalEvents(): Promise<WildlifeSeasonalEvent[]> {
  const { data, error } = await supabase
    .from('wildlife_seasonal_events')
    .select('*')
    .eq('is_active', true)
    .order('start_month', { ascending: true });
  if (error) {
    console.error('Error fetching seasonal events:', error);
    return [];
  }
  return (data || []) as WildlifeSeasonalEvent[];
}

export async function fetchSightingById(id: string): Promise<WildlifeSighting | null> {
  const { data, error } = await supabase
    .from('wildlife_sightings')
    .select('*')
    .eq('id', id)
    .single();
  if (error) {
    console.error('Error fetching sighting:', error);
    return null;
  }
  return data as WildlifeSighting;
}

export async function fetchSpeciesBySlug(slug: string): Promise<WildlifeSpecies | null> {
  const { data, error } = await supabase
    .from('wildlife_species')
    .select('*')
    .eq('slug', slug)
    .single();
  if (error) {
    console.error('Error fetching species:', error);
    return null;
  }
  return data as WildlifeSpecies;
}

export async function fetchSeasonalEventsForSpecies(speciesId: string): Promise<WildlifeSeasonalEvent[]> {
  const { data, error } = await supabase
    .from('wildlife_seasonal_events')
    .select('*')
    .eq('species_id', speciesId)
    .eq('is_active', true)
    .order('start_month', { ascending: true });
  if (error) {
    console.error('Error fetching species events:', error);
    return [];
  }
  return (data || []) as WildlifeSeasonalEvent[];
}

export async function fetchSightings(opts: {
  species_id?: string;
  hours?: number;
  limit?: number;
} = {}): Promise<WildlifeSighting[]> {
  let query = supabase
    .from('wildlife_sightings')
    .select('*')
    .eq('is_visible', true);
  if (opts.species_id) query = query.eq('species_id', opts.species_id);
  if (opts.hours != null) {
    const since = new Date(Date.now() - opts.hours * 60 * 60 * 1000).toISOString();
    query = query.gte('observed_at', since);
  }
  const { data, error } = await query
    .order('observed_at', { ascending: false })
    .limit(opts.limit ?? 50);
  if (error) {
    console.error('Error fetching sightings:', error);
    return [];
  }
  return (data || []) as WildlifeSighting[];
}

export interface SightingInput {
  species_id: string;
  observer_wallet?: string | null;
  observer_name_de?: string | null;
  lat: number;
  lon: number;
  individual_count?: number;
  notes_de?: string | null;
  photo_url?: string | null;
  near_landmark_de?: string | null;
}

export async function submitSighting(
  input: SightingInput,
  protectCoordinates = false
): Promise<{ id: string } | null> {
  const display = protectCoordinates ? fuzzCoordinate(input.lat, input.lon) : { lat: input.lat, lon: input.lon };
  // Cast: Supabase generated types do not yet know about new tables until regenerated.
  const { data, error } = await (supabase as any)
    .from('wildlife_sightings')
    .insert({
      species_id: input.species_id,
      observer_wallet: input.observer_wallet ?? null,
      observer_name_de: input.observer_name_de ?? null,
      lat: display.lat,
      lon: display.lon,
      raw_lat: input.lat,
      raw_lon: input.lon,
      individual_count: input.individual_count ?? 1,
      notes_de: input.notes_de ?? null,
      photo_url: input.photo_url ?? null,
      near_landmark_de: input.near_landmark_de ?? null,
      is_visible: true,
    })
    .select('id')
    .single();
  if (error) {
    console.error('Error submitting sighting:', error);
    return null;
  }
  return data as { id: string };
}

// Time-decay weighting: sightings older than 24h fade.
export function freshnessLabelDe(observedAt: string): string {
  const age = Date.now() - new Date(observedAt).getTime();
  const minutes = age / 60000;
  if (minutes < 60) return `vor ${Math.round(minutes)} min`;
  if (minutes < 24 * 60) return `vor ${Math.round(minutes / 60)} h`;
  const days = Math.round(minutes / 60 / 24);
  return `vor ${days} ${days === 1 ? 'Tag' : 'Tagen'}`;
}
