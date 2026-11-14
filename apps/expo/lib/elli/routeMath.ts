// Geometry helpers for moving a vehicle smoothly along a road polyline.
// Coordinates are GeoJSON order [lng, lat]. Distances in metres.

export type LngLat = [number, number];

const R = 6371008.8;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

export function distanceM(a: LngLat, b: LngLat): number {
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Compass bearing from a to b, degrees clockwise from north (0..360). */
export function bearingDeg(a: LngLat, b: LngLat): number {
  const y = Math.sin(toRad(b[0] - a[0])) * Math.cos(toRad(b[1]));
  const x =
    Math.cos(toRad(a[1])) * Math.sin(toRad(b[1])) -
    Math.sin(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.cos(toRad(b[0] - a[0]));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export type Polyline = {
  coords: LngLat[];
  /** cumulative distance at each vertex */
  cum: number[];
  length: number;
};

export function buildPolyline(coords: LngLat[]): Polyline {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + distanceM(coords[i - 1], coords[i]));
  return { coords, cum, length: cum[cum.length - 1] };
}

function segmentIndex(line: Polyline, d: number): number {
  // binary search: last i with cum[i] <= d
  let lo = 0;
  let hi = line.cum.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (line.cum[mid] <= d) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function pointAt(line: Polyline, d: number): LngLat {
  const dist = Math.max(0, Math.min(line.length, d));
  const i = segmentIndex(line, dist);
  const a = line.coords[i];
  const b = line.coords[i + 1] ?? a;
  const seg = line.cum[i + 1] - line.cum[i] || 1;
  const t = (dist - line.cum[i]) / seg;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/**
 * Heading at distance d, measured across a window of ±`windowM` metres so
 * tiny kinks in the road geometry (roundabouts, snapping noise) don't make
 * the vehicle twitch.
 */
export function headingAt(line: Polyline, d: number, windowM = 10): number {
  const a = pointAt(line, d - windowM);
  const b = pointAt(line, d + windowM);
  return bearingDeg(a, b);
}

/** The part of the line still ahead of distance d (starts exactly at d). */
export function remainingFrom(line: Polyline, d: number): LngLat[] {
  const dist = Math.max(0, Math.min(line.length, d));
  const i = segmentIndex(line, dist);
  return [pointAt(line, dist), ...line.coords.slice(i + 1)];
}

/** Rotate `from` towards `to` along the shorter way round, by factor k (0..1). */
export function lerpAngle(from: number, to: number, k: number): number {
  const diff = ((to - from + 540) % 360) - 180;
  return (from + diff * k + 360) % 360;
}
