import { supabase } from './supabase';

export type PoiType =
  | 'toilet'
  | 'drinking_water'
  | 'bike_repair'
  | 'bike_rental'
  | 'swim_spot'
  | 'indoor_alternative'
  | 'tourist_info'
  | 'pharmacy'
  | 'observation_stand'
  | 'viewpoint';

export type PoiStatus =
  | 'open'
  | 'closed'
  | 'seasonal'
  | 'unknown'
  | 'swim_green'
  | 'swim_yellow'
  | 'swim_red'
  | 'swim_forbidden';

export interface PoiRecord {
  id: string;
  type: PoiType;
  name_de: string;
  description_de: string | null;
  lat: number;
  lon: number;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  opening_hours_de: string | null;
  is_24h: boolean;
  is_pannendienst: boolean;
  has_gaestekarte_discount: boolean;
  status: PoiStatus | null;
  status_note_de: string | null;
  status_updated_at: string | null;
  status_source_de: string | null;
  meta: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type AdvisoryType = 'mosquito' | 'tick' | 'cyanobacteria' | 'pollen' | 'sun';
export type AdvisoryLevel = 'niedrig' | 'mittel' | 'hoch' | 'sehr_hoch';

export interface DailyAdvisoryRecord {
  id: string;
  advisory_date: string;
  type: AdvisoryType;
  level: AdvisoryLevel;
  message_de: string;
  recommendation_de: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export type HelpRequestType = 'breakdown' | 'lost' | 'medical' | 'general';

export interface HelpRequestInput {
  user_wallet?: string | null;
  user_name?: string | null;
  contact_phone?: string | null;
  request_type: HelpRequestType;
  lat: number;
  lon: number;
  message_de?: string | null;
}

// ─── German labels (used in screens + Mecky responses) ───────

export const POI_TYPE_LABELS_DE: Record<PoiType, string> = {
  toilet: 'Toilette',
  drinking_water: 'Trinkwasser',
  bike_repair: 'Fahrrad-Werkstatt',
  bike_rental: 'Fahrradverleih',
  swim_spot: 'Badestelle',
  indoor_alternative: 'Schlechtwetter',
  tourist_info: 'Tourist-Info',
  pharmacy: 'Apotheke',
  observation_stand: 'Beobachtungsstand',
  viewpoint: 'Aussichtspunkt',
};

export const POI_TYPE_COLORS: Record<PoiType, string> = {
  toilet: '#5E6BFF',
  drinking_water: '#00B7C2',
  bike_repair: '#E85D04',
  bike_rental: '#F4A261',
  swim_spot: '#00A6FB',
  indoor_alternative: '#9B5DE5',
  tourist_info: '#194383',
  pharmacy: '#D62828',
  observation_stand: '#2B9348',
  viewpoint: '#FFB703',
};

export const SWIM_STATUS_LABELS_DE: Record<string, string> = {
  swim_green: 'Heute baden? Ja.',
  swim_yellow: 'Heute baden? Mit Vorsicht.',
  swim_red: 'Heute baden? Lieber nicht.',
  swim_forbidden: 'Badeverbot',
};

export const SWIM_STATUS_COLORS: Record<string, string> = {
  swim_green: '#2B9348',
  swim_yellow: '#FFB703',
  swim_red: '#D62828',
  swim_forbidden: '#7A1212',
};

export const ADVISORY_LEVEL_LABELS_DE: Record<AdvisoryLevel, string> = {
  niedrig: 'Niedrig',
  mittel: 'Mittel',
  hoch: 'Hoch',
  sehr_hoch: 'Sehr hoch',
};

export const ADVISORY_LEVEL_COLORS: Record<AdvisoryLevel, string> = {
  niedrig: '#2B9348',
  mittel: '#FFB703',
  hoch: '#E85D04',
  sehr_hoch: '#D62828',
};

// ─── Fetchers ────────────────────────────────────────────────

export async function fetchPois(types?: PoiType[]): Promise<PoiRecord[]> {
  let query = supabase.from('pois').select('*').eq('is_active', true);
  if (types && types.length > 0) {
    query = query.in('type', types);
  }
  const { data, error } = await query.order('name_de', { ascending: true });
  if (error) {
    console.error('Error fetching pois:', error);
    return [];
  }
  return (data || []) as PoiRecord[];
}

export async function fetchPoiById(id: string): Promise<PoiRecord | null> {
  const { data, error } = await supabase.from('pois').select('*').eq('id', id).single();
  if (error) {
    console.error('Error fetching poi:', error);
    return null;
  }
  return data as PoiRecord;
}

export async function fetchTodayAdvisories(): Promise<DailyAdvisoryRecord[]> {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('daily_advisories')
    .select('*')
    .eq('advisory_date', today);
  if (error) {
    console.error('Error fetching advisories:', error);
    return [];
  }
  return (data || []) as DailyAdvisoryRecord[];
}

export async function submitHelpRequest(input: HelpRequestInput): Promise<{ id: string } | null> {
  // Cast: Supabase generated types do not yet know about new tables until regenerated.
  const { data, error } = await (supabase as any)
    .from('help_requests')
    .insert({
      user_wallet: input.user_wallet ?? null,
      user_name: input.user_name ?? null,
      contact_phone: input.contact_phone ?? null,
      request_type: input.request_type,
      lat: input.lat,
      lon: input.lon,
      message_de: input.message_de ?? null,
    })
    .select('id')
    .single();
  if (error) {
    console.error('Error submitting help request:', error);
    return null;
  }
  return data as { id: string };
}

// Haversine distance in km
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
