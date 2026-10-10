/**
 * Screen-space pin grouping for the main map.
 *
 * Mapbox's native clustering only yields a count bubble. A group here knows
 * its members, so the map can draw it as a stack of their photos with the
 * most important member's name ("Herbstmarkt +3 weitere"). The town has a
 * few dozen pins, so a greedy O(n²) pass per zoom step is plenty.
 */
import type { MapFeatureProperties, MapGeoJSON } from './geojson';

type PinFeature = MapGeoJSON['features'][number];

export type PinGroup = {
  /** Stable while the membership stays the same. */
  key: string;
  /** Where the group is drawn — its most important member's position. */
  coordinate: [number, number];
  /** Most important first. */
  members: MapFeatureProperties[];
  /** [[minLon, minLat], [maxLon, maxLat]] over all members. */
  bounds: [[number, number], [number, number]];
};

export type PinGrouping = {
  /** Pins drawn on their own. */
  singles: MapGeoJSON;
  groups: PinGroup[];
};

/** Logical points per world width at zoom 0 (Mapbox GL uses 512px tiles). */
const TILE_SIZE = 512;

/** Web-Mercator position in logical points at `zoom`. */
export function project(lon: number, lat: number, zoom: number): [number, number] {
  const size = TILE_SIZE * 2 ** zoom;
  const sin = Math.sin((lat * Math.PI) / 180);
  const x = ((lon + 180) / 360) * size;
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size;
  return [x, y];
}

/**
 * Group pins that sit closer than `radius` points at `zoom`. Higher-ranked
 * pins anchor groups, so the name a group shows is its most important one.
 * `keepSingle` (the selected pin) is never swallowed into a group.
 */
export function groupPins(
  geojson: MapGeoJSON,
  zoom: number,
  radius: number,
  keepSingle?: string | null
): PinGrouping {
  const items = geojson.features.map((f, index) => ({
    f,
    index,
    xy: project(f.geometry.coordinates[0], f.geometry.coordinates[1], zoom),
  }));
  // Rank first; ties keep input order (events arrive soonest first).
  const order = [...items].sort(
    (a, b) => (b.f.properties.rank ?? 0) - (a.f.properties.rank ?? 0) || a.index - b.index
  );

  const taken = new Set<number>();
  const singles: PinFeature[] = [];
  const groups: PinGroup[] = [];
  const r2 = radius * radius;

  for (const anchor of order) {
    if (taken.has(anchor.index)) continue;
    taken.add(anchor.index);
    if (anchor.f.properties.fid === keepSingle) {
      singles.push(anchor.f);
      continue;
    }
    const members = [anchor];
    for (const other of order) {
      if (taken.has(other.index) || other.f.properties.fid === keepSingle) continue;
      const dx = other.xy[0] - anchor.xy[0];
      const dy = other.xy[1] - anchor.xy[1];
      if (dx * dx + dy * dy <= r2) {
        taken.add(other.index);
        members.push(other);
      }
    }
    if (members.length === 1) {
      singles.push(anchor.f);
      continue;
    }
    const lons = members.map((m) => m.f.geometry.coordinates[0]);
    const lats = members.map((m) => m.f.geometry.coordinates[1]);
    groups.push({
      key: members
        .map((m) => m.f.properties.fid)
        .sort()
        .join('|'),
      coordinate: anchor.f.geometry.coordinates as [number, number],
      members: members.map((m) => m.f.properties),
      bounds: [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)],
      ],
    });
  }

  return { singles: { type: 'FeatureCollection', features: singles }, groups };
}

/** Rough ground distance in metres across a group's bounds. */
export function boundsSpanMeters(bounds: PinGroup['bounds']): number {
  const [[minLon, minLat], [maxLon, maxLat]] = bounds;
  const midLat = ((minLat + maxLat) / 2) * (Math.PI / 180);
  const dx = (maxLon - minLon) * 111_320 * Math.cos(midLat);
  const dy = (maxLat - minLat) * 110_540;
  return Math.sqrt(dx * dx + dy * dy);
}
