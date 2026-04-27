/**
 * Live vehicle simulation — given the static schedule (lines, stops, departures),
 * estimate where each currently-running bus / ferry would be on the map right now,
 * by interpolating along the stop polyline based on elapsed trip time.
 *
 * Frontend-only. Refreshed by callers on a setInterval (~15s).
 */

import {
  isInSeason,
  isServiceToday,
  type TransitDeparture,
  type TransitLine,
  type TransitMode,
  type TransitStop,
} from './supabase-transit';
import { distanceKm } from './supabase-pois';

export interface LiveVehicle {
  id: string; // departure_id
  line_id: string;
  line_code: string;
  line_name_de: string;
  mode: TransitMode;
  lat: number;
  lon: number;
  progress: number; // 0..1 along the trip
  current_stop_name: string | null;
  next_stop_name: string | null;
  arrives_in_minutes: number | null;
  is_returning: boolean;
}

// Estimated trip duration per mode, in minutes.
// Used as fallback when departure has no arrival_time.
const MODE_DURATION_DEFAULTS: Record<TransitMode, number> = {
  bus_regio: 60,    // Linie 12 Röbel ↔ Waren ↔ Neubrandenburg full leg
  bus_city: 38,     // Stadtbus 024 round trip (seed data)
  bus_park: 45,     // Nationalpark-Linien
  buergerbus: 0,    // call-only — no live simulation
  ferry: 75,        // MS Diana per leg
  train: 60,
};

// Bus_city does a loop (round trip). Others are one-way.
function isRoundTrip(mode: TransitMode): boolean {
  return mode === 'bus_city';
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function nowInMinutes(date: Date): number {
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}

function computeTripDurationMin(dep: TransitDeparture, mode: TransitMode): number {
  if (dep.arrival_time) {
    const a = timeToMinutes(dep.arrival_time);
    const d = timeToMinutes(dep.departure_time);
    if (a > d) return a - d;
  }
  return MODE_DURATION_DEFAULTS[mode] || 60;
}

function buildPath(
  stops: TransitStop[],
  roundTrip: boolean
): { points: { lat: number; lon: number; name: string }[]; segLengths: number[]; total: number } {
  const ordered = stops
    .filter((s) => s.lat != null && s.lon != null)
    .sort((a, b) => a.stop_order - b.stop_order);
  const fwd = ordered.map((s) => ({ lat: s.lat!, lon: s.lon!, name: s.name_de }));
  const points = roundTrip ? [...fwd, ...[...fwd].reverse().slice(1)] : fwd;
  const segLengths: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const seg = distanceKm(
      points[i - 1].lat,
      points[i - 1].lon,
      points[i].lat,
      points[i].lon
    );
    segLengths.push(seg);
    total += seg;
  }
  return { points, segLengths, total };
}

function positionOnPath(
  path: ReturnType<typeof buildPath>,
  fraction: number
): {
  lat: number;
  lon: number;
  current_idx: number;
  next_idx: number;
  next_distance_remaining: number;
} | null {
  const { points, segLengths, total } = path;
  if (points.length < 2 || total <= 0) return null;
  const f = Math.min(1, Math.max(0, fraction));
  const target = f * total;
  let cumulative = 0;
  for (let i = 0; i < segLengths.length; i++) {
    if (cumulative + segLengths[i] >= target) {
      const segFrac = segLengths[i] === 0 ? 0 : (target - cumulative) / segLengths[i];
      const a = points[i];
      const b = points[i + 1];
      const lat = a.lat + (b.lat - a.lat) * segFrac;
      const lon = a.lon + (b.lon - a.lon) * segFrac;
      const remaining = (1 - segFrac) * segLengths[i];
      return { lat, lon, current_idx: i, next_idx: i + 1, next_distance_remaining: remaining };
    }
    cumulative += segLengths[i];
  }
  // exactly at end
  const last = points[points.length - 1];
  return {
    lat: last.lat,
    lon: last.lon,
    current_idx: points.length - 1,
    next_idx: points.length - 1,
    next_distance_remaining: 0,
  };
}

export function computeLiveVehicles(opts: {
  lines: TransitLine[];
  stops: TransitStop[];
  departures: TransitDeparture[];
  now?: Date;
}): LiveVehicle[] {
  const now = opts.now ?? new Date();
  const nowMin = nowInMinutes(now);
  const out: LiveVehicle[] = [];

  // Index stops by line_id
  const stopsByLine = new Map<string, TransitStop[]>();
  for (const s of opts.stops) {
    const arr = stopsByLine.get(s.line_id) ?? [];
    arr.push(s);
    stopsByLine.set(s.line_id, arr);
  }

  // Cache paths per line + round-trip flag (constant)
  const pathByLine = new Map<string, ReturnType<typeof buildPath>>();

  for (const dep of opts.departures) {
    const line = opts.lines.find((l) => l.id === dep.line_id);
    if (!line) continue;
    if (line.mode === 'buergerbus') continue; // call-only — skip

    if (!isInSeason(dep.season_start, dep.season_end, now)) continue;
    if (!isServiceToday(dep.service_days, now)) continue;

    const departMin = timeToMinutes(dep.departure_time);
    const duration = computeTripDurationMin(dep, line.mode);
    const arriveMin = departMin + duration;

    if (nowMin < departMin || nowMin > arriveMin) continue;

    const elapsed = nowMin - departMin;
    const progress = duration === 0 ? 0 : Math.min(1, elapsed / duration);

    let path = pathByLine.get(line.id);
    if (!path) {
      const lineStops = stopsByLine.get(line.id) ?? [];
      path = buildPath(lineStops, isRoundTrip(line.mode));
      pathByLine.set(line.id, path);
    }
    if (path.points.length < 2) continue;

    const pos = positionOnPath(path, progress);
    if (!pos) continue;

    // Estimate ETA to next stop based on average speed (total distance / duration)
    const avgKmPerMin = path.total / duration;
    const arrivesInMinutes =
      avgKmPerMin > 0 ? Math.max(0, pos.next_distance_remaining / avgKmPerMin) : null;

    out.push({
      id: dep.id,
      line_id: line.id,
      line_code: line.code,
      line_name_de: line.name_de,
      mode: line.mode,
      lat: pos.lat,
      lon: pos.lon,
      progress,
      current_stop_name: path.points[pos.current_idx]?.name ?? null,
      next_stop_name: path.points[pos.next_idx]?.name ?? null,
      arrives_in_minutes: arrivesInMinutes,
      is_returning: progress > 0.5 && isRoundTrip(line.mode),
    });
  }

  return out;
}

export function vehiclesToGeoJSON(
  vehicles: LiveVehicle[]
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const TRANSIT_EMOJIS: Record<string, string> = {
    bus_regio: '🚌',
    bus_city: '🚐',
    bus_park: '🌲',
    buergerbus: '💛',
    ferry: '⛴️',
    train: '🚆',
  };
  const TRANSIT_COLORS: Record<string, string> = {
    bus_regio: '#194383',
    bus_city: '#0077B6',
    bus_park: '#2B9348',
    buergerbus: '#FFB703',
    ferry: '#00A6FB',
    train: '#7209B7',
  };
  return {
    type: 'FeatureCollection',
    features: vehicles.map((v) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [v.lon, v.lat] },
      properties: {
        id: v.id,
        line_code: v.line_code,
        line_name_de: v.line_name_de,
        mode: v.mode,
        emoji: TRANSIT_EMOJIS[v.mode] || '🚌',
        color: TRANSIT_COLORS[v.mode] || '#194383',
        next_stop_name: v.next_stop_name ?? '',
        arrives_in_minutes: v.arrives_in_minutes ?? -1,
        progress: v.progress,
      },
    })),
  };
}
