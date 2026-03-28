import type { EventRecord, RestaurantRecord, BusinessRecord, MapEntityType } from '@/lib/types';
import { ROEBEL_CENTER } from './constants';

// --- Event-specific types (kept for backward compat) ---

export type EventWithCoordinates = EventRecord & {
  latitude: number;
  longitude: number;
};

export type EventFeatureProperties = {
  id: string;
  title: string;
  category: string;
  image_url: string | null;
  date: string;
  location: string;
};

export type EventGeoJSON = GeoJSON.FeatureCollection<GeoJSON.Point, EventFeatureProperties>;

// --- Unified map types ---

export type MapFeatureProperties = {
  id: string;
  entityType: MapEntityType;
  title: string;
  subtitle: string;
  category: string;
  image_url: string | null;
  date: string | null;
  slug: string | null;
};

export type MapGeoJSON = GeoJSON.FeatureCollection<GeoJSON.Point, MapFeatureProperties>;

/**
 * Generate random coordinates within a radius (in km) of a center point.
 * Used as fallback for entities without geocoded coordinates.
 */
export function generateFallbackCoordinates(
  centerLat: number,
  centerLng: number,
  radiusKm: number
): { lat: number; lng: number } {
  const radiusDeg = radiusKm / 111; // 1 degree ≈ 111km
  const angle = Math.random() * Math.PI * 2;
  const distance = Math.random() * radiusDeg;

  return {
    lat: centerLat + distance * Math.cos(angle),
    lng: centerLng + distance * Math.sin(angle),
  };
}

/**
 * Ensure all items have non-null lat/lng, using fallback coords for items without.
 */
function ensureCoordinates<T extends { latitude: number | null; longitude: number | null }>(
  items: T[]
): (T & { latitude: number; longitude: number })[] {
  return items.map((item) => {
    if (item.latitude !== null && item.longitude !== null) {
      return item as T & { latitude: number; longitude: number };
    }
    const fallback = generateFallbackCoordinates(ROEBEL_CENTER[1], ROEBEL_CENTER[0], 2);
    return { ...item, latitude: fallback.lat, longitude: fallback.lng };
  });
}

/**
 * Process raw events from Supabase into events with guaranteed coordinates.
 */
export function processEventsWithCoordinates(events: EventRecord[]): EventWithCoordinates[] {
  return ensureCoordinates(events);
}

/**
 * Convert events with coordinates into a GeoJSON FeatureCollection for Mapbox ShapeSource.
 */
export function eventsToGeoJSON(events: EventWithCoordinates[]): EventGeoJSON {
  return {
    type: 'FeatureCollection',
    features: events.map((event) => ({
      type: 'Feature',
      id: event.id,
      geometry: {
        type: 'Point',
        coordinates: [event.longitude, event.latitude],
      },
      properties: {
        id: event.id,
        title: event.title,
        category: event.category || 'Sonstige',
        image_url: event.image_url,
        date: event.date,
        location: event.location,
      },
    })),
  };
}

/**
 * Convert events, restaurants, and businesses into a unified GeoJSON FeatureCollection.
 * GeoJSON uses [longitude, latitude] coordinate order.
 */
export function entitiesToGeoJSON(
  events: EventWithCoordinates[],
  restaurants: RestaurantRecord[],
  businesses: BusinessRecord[]
): MapGeoJSON {
  const eventFeatures: GeoJSON.Feature<GeoJSON.Point, MapFeatureProperties>[] = events.map((e) => ({
    type: 'Feature',
    id: `event-${e.id}`,
    geometry: {
      type: 'Point',
      coordinates: [e.longitude, e.latitude],
    },
    properties: {
      id: e.id,
      entityType: 'event' as const,
      title: e.title,
      subtitle: e.location || '',
      category: e.category || 'Sonstige',
      image_url: e.image_url,
      date: e.date,
      slug: null,
    },
  }));

  const restaurantsWithCoords = ensureCoordinates(restaurants);
  const restaurantFeatures: GeoJSON.Feature<GeoJSON.Point, MapFeatureProperties>[] =
    restaurantsWithCoords.map((r) => ({
      type: 'Feature',
      id: `restaurant-${r.id}`,
      geometry: {
        type: 'Point',
        coordinates: [r.longitude, r.latitude],
      },
      properties: {
        id: r.id,
        entityType: 'restaurant' as const,
        title: r.name,
        subtitle: r.address || '',
        category: 'restaurant',
        image_url: r.cover_image_url || r.logo_url,
        date: null,
        slug: r.slug,
      },
    }));

  const businessesWithCoords = ensureCoordinates(businesses);
  const businessFeatures: GeoJSON.Feature<GeoJSON.Point, MapFeatureProperties>[] =
    businessesWithCoords.map((b) => ({
      type: 'Feature',
      id: `business-${b.id}`,
      geometry: {
        type: 'Point',
        coordinates: [b.longitude, b.latitude],
      },
      properties: {
        id: b.id,
        entityType: 'business' as const,
        title: b.name,
        subtitle: b.address || '',
        category: b.category || 'sonstiges',
        image_url: b.cover_image_url || b.logo_url,
        date: null,
        slug: b.slug,
      },
    }));

  return {
    type: 'FeatureCollection',
    features: [...eventFeatures, ...restaurantFeatures, ...businessFeatures],
  };
}
