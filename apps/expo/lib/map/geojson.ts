import type { EventRecord, RestaurantRecord, BusinessRecord, MapEntityType } from '@/lib/types';
import type { PoiRecord } from '@/lib/supabase-pois';
import {
  businessEmoji,
  eventEmoji,
  markerImageForSlug,
  poiEmoji,
  restaurantEmoji,
  type MarkerSize,
} from './markers';

export type EventWithCoordinates = EventRecord & {
  latitude: number;
  longitude: number;
};

export type MapFeatureProperties = {
  id: string;
  entityType: MapEntityType;
  // Unique feature id across entity types — used for selected-pin styling.
  fid: string;
  title: string;
  subtitle: string;
  category: string;
  image_url: string | null;
  date: string | null;
  slug: string | null;
  poi_type: string | null;
  poi_status: string | null;
  emoji: string;
  size: MarkerSize;
  featured: boolean;
  // Key into MARKER_IMAGES (lib/map/markers.ts). Omitted (not null) when no
  // PNG pin is registered, so Mapbox `['has','markerImage']` filters work.
  markerImage?: string;
};

export type MapGeoJSON = GeoJSON.FeatureCollection<GeoJSON.Point, MapFeatureProperties>;

/**
 * Keep only events with real coordinates. Entities without geocoding no
 * longer get fabricated positions — a wrong pin is worse than no pin.
 */
export function processEventsWithCoordinates(events: EventRecord[]): EventWithCoordinates[] {
  return events.filter(
    (e): e is EventWithCoordinates => e.latitude != null && e.longitude != null
  );
}

function hasCoordinates<T extends { latitude: number | null; longitude: number | null }>(
  item: T
): item is T & { latitude: number; longitude: number } {
  return item.latitude != null && item.longitude != null;
}

function feature(
  lon: number,
  lat: number,
  props: Omit<MapFeatureProperties, 'fid'> & { markerImage?: string }
): GeoJSON.Feature<GeoJSON.Point, MapFeatureProperties> {
  const { markerImage, ...rest } = props;
  return {
    type: 'Feature',
    id: `${props.entityType}-${props.id}`,
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: {
      ...rest,
      fid: `${props.entityType}-${props.id}`,
      ...(markerImage ? { markerImage } : {}),
    },
  };
}

/**
 * Convert events, restaurants, businesses and POIs into a unified GeoJSON
 * FeatureCollection for the clustered map source. [lng, lat] order.
 */
export function entitiesToGeoJSON(
  events: EventWithCoordinates[],
  restaurants: RestaurantRecord[],
  businesses: BusinessRecord[],
  pois: PoiRecord[] = []
): MapGeoJSON {
  const features: GeoJSON.Feature<GeoJSON.Point, MapFeatureProperties>[] = [];

  for (const e of events) {
    const featured = !!e.is_popular;
    features.push(
      feature(e.longitude, e.latitude, {
        id: e.id,
        entityType: 'event',
        title: e.title,
        subtitle: e.location || '',
        category: e.category || 'Sonstige',
        image_url: e.image_url,
        date: e.date,
        slug: null,
        poi_type: null,
        poi_status: null,
        emoji: eventEmoji(e.category),
        size: featured ? 'lg' : 'md',
        featured,
      })
    );
  }

  for (const r of restaurants.filter(hasCoordinates)) {
    const featured = !!r.is_featured;
    features.push(
      feature(r.longitude, r.latitude, {
        id: r.id,
        entityType: 'restaurant',
        title: r.name,
        subtitle: r.address || '',
        category: 'restaurant',
        image_url: r.cover_image_url || r.logo_url,
        date: null,
        slug: r.slug,
        poi_type: null,
        poi_status: null,
        emoji: restaurantEmoji(r.slug),
        size: featured ? 'lg' : 'md',
        featured,
        markerImage: markerImageForSlug(r.slug),
      })
    );
  }

  for (const b of businesses.filter(hasCoordinates)) {
    const featured = !!b.is_featured;
    features.push(
      feature(b.longitude, b.latitude, {
        id: b.id,
        entityType: 'business',
        title: b.name,
        subtitle: b.address || '',
        category: b.category || 'sonstiges',
        image_url: b.cover_image_url || b.logo_url,
        date: null,
        slug: b.slug,
        poi_type: null,
        poi_status: null,
        emoji: businessEmoji(b.slug, b.category),
        size: featured ? 'lg' : 'md',
        featured,
        markerImage: markerImageForSlug(b.slug),
      })
    );
  }

  for (const p of pois) {
    features.push(
      feature(p.lon, p.lat, {
        id: p.id,
        entityType: 'poi',
        title: p.name_de,
        subtitle: p.address || '',
        category: p.type,
        image_url: null,
        date: null,
        slug: null,
        poi_type: p.type,
        poi_status: p.status,
        emoji: poiEmoji(p.type),
        size: 'sm',
        featured: false,
      })
    );
  }

  return { type: 'FeatureCollection', features };
}
