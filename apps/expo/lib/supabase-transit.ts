import { supabase } from './supabase';
import { distanceKm } from './supabase-pois';

export type TransitMode =
  | 'bus_regio'
  | 'bus_city'
  | 'bus_park'
  | 'buergerbus'
  | 'ferry'
  | 'train';

export interface TransitLine {
  id: string;
  code: string;
  name_de: string;
  mode: TransitMode;
  operator_de: string | null;
  free_with_gaestekarte: boolean;
  carries_bikes: boolean;
  bike_fee_eur: number | null;
  fare_de: string | null;
  season_window_de: string | null;
  call_phone: string | null;
  call_email: string | null;
  call_window_de: string | null;
  website: string | null;
  notes_de: string | null;
  is_active: boolean;
  is_electric: boolean;
  is_volunteer: boolean;
}

export interface TransitStop {
  id: string;
  line_id: string;
  name_de: string;
  lat: number | null;
  lon: number | null;
  stop_order: number;
  notes_de: string | null;
  is_active: boolean;
}

export interface TransitDeparture {
  id: string;
  line_id: string;
  stop_id: string | null;
  service_days: string;
  season_start: string | null;
  season_end: string | null;
  departure_time: string;
  arrival_time: string | null;
  destination_de: string | null;
  trip_label_de: string | null;
  notes_de: string | null;
  is_last_of_day: boolean;
  is_active: boolean;
}

export const TRANSIT_MODE_LABELS_DE: Record<TransitMode, string> = {
  bus_regio: 'Regiobus',
  bus_city: 'Stadtbus',
  bus_park: 'Nationalpark-Linie',
  buergerbus: 'Bürgerbus',
  ferry: 'Schiff',
  train: 'Bahn',
};

export const TRANSIT_MODE_EMOJIS: Record<TransitMode, string> = {
  bus_regio: '🚌',
  bus_city: '🚐',
  bus_park: '🌲',
  buergerbus: '💛',
  ferry: '⛴️',
  train: '🚆',
};

export const TRANSIT_MODE_COLORS: Record<TransitMode, string> = {
  bus_regio: '#194383',
  bus_city: '#0077B6',
  bus_park: '#2B9348',
  buergerbus: '#FFB703',
  ferry: '#00A6FB',
  train: '#7209B7',
};

const DAY_KEYS = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'] as const;

export function isServiceToday(serviceDays: string, date = new Date()): boolean {
  const day = DAY_KEYS[date.getDay()];
  return serviceDays.split(',').map((d) => d.trim()).includes(day);
}

export function isInSeason(
  seasonStart: string | null,
  seasonEnd: string | null,
  date = new Date()
): boolean {
  if (!seasonStart || !seasonEnd) return true;
  const today = date.toISOString().slice(0, 10);
  return today >= seasonStart && today <= seasonEnd;
}

export function isUpcoming(departureTime: string, date = new Date()): boolean {
  const [h, m] = departureTime.split(':').map(Number);
  const dep = new Date(date);
  dep.setHours(h, m, 0, 0);
  return dep.getTime() >= date.getTime();
}

// ─── Fetchers ────────────────────────────────────────────────

export async function fetchTransitLineByCode(code: string): Promise<TransitLine | null> {
  const { data, error } = await supabase
    .from('transit_lines')
    .select('*')
    .eq('code', code)
    .single();
  if (error) {
    console.error('Error fetching transit line:', error);
    return null;
  }
  return data as TransitLine;
}

export async function fetchTransitLines(): Promise<TransitLine[]> {
  const { data, error } = await supabase
    .from('transit_lines')
    .select('*')
    .eq('is_active', true)
    .order('code', { ascending: true });
  if (error) {
    console.error('Error fetching transit lines:', error);
    return [];
  }
  return (data || []) as TransitLine[];
}

export async function fetchTransitStops(lineId?: string): Promise<TransitStop[]> {
  let query = supabase.from('transit_stops').select('*').eq('is_active', true);
  if (lineId) query = query.eq('line_id', lineId);
  const { data, error } = await query.order('stop_order', { ascending: true });
  if (error) {
    console.error('Error fetching transit stops:', error);
    return [];
  }
  return (data || []) as TransitStop[];
}

export async function fetchTransitDepartures(lineId?: string): Promise<TransitDeparture[]> {
  let query = supabase.from('transit_departures').select('*').eq('is_active', true);
  if (lineId) query = query.eq('line_id', lineId);
  const { data, error } = await query.order('departure_time', { ascending: true });
  if (error) {
    console.error('Error fetching transit departures:', error);
    return [];
  }
  return (data || []) as TransitDeparture[];
}

export interface NextDeparture {
  line: TransitLine;
  stop: TransitStop | null;
  departure: TransitDeparture;
  distance_km?: number;
}

export async function fetchNextDepartures(opts: {
  lat?: number;
  lon?: number;
  limit?: number;
  now?: Date;
}): Promise<NextDeparture[]> {
  const now = opts.now ?? new Date();
  const [lines, stops, departures] = await Promise.all([
    fetchTransitLines(),
    fetchTransitStops(),
    fetchTransitDepartures(),
  ]);
  const lineById = new Map(lines.map((l) => [l.id, l]));
  const stopById = new Map(stops.map((s) => [s.id, s]));

  const upcoming: NextDeparture[] = [];
  for (const d of departures) {
    if (!isInSeason(d.season_start, d.season_end, now)) continue;
    if (!isServiceToday(d.service_days, now)) continue;
    if (!isUpcoming(d.departure_time, now)) continue;
    const line = lineById.get(d.line_id);
    if (!line) continue;
    const stop = d.stop_id ? stopById.get(d.stop_id) ?? null : null;
    let distance_km: number | undefined;
    if (
      opts.lat != null &&
      opts.lon != null &&
      stop?.lat != null &&
      stop?.lon != null
    ) {
      distance_km = distanceKm(opts.lat, opts.lon, stop.lat, stop.lon);
    }
    upcoming.push({ line, stop, departure: d, distance_km });
  }
  upcoming.sort((a, b) =>
    a.departure.departure_time.localeCompare(b.departure.departure_time)
  );
  return upcoming.slice(0, opts.limit ?? 20);
}
