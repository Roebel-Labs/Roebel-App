/**
 * One selectable place on the map, whatever table it comes from, plus the
 * read-only presenters the sheets share (title, address, category, images).
 *
 * Pure functions with no React so the place sheet, the category lists and the
 * tests can all read a place the same way.
 */
import { BUSINESS_CATEGORY_LABELS } from '@/lib/map/constants';
import { businessEmoji, eventEmoji, orgEmoji, poiEmoji, restaurantEmoji } from '@/lib/map/markers';
import { POI_TYPE_LABELS_DE, type PoiRecord } from '@/lib/supabase-pois';
import {
  SUB_TYPE_LABELS,
  type Account,
  type BusinessRecord,
  type EventRecord,
  type OpeningHours,
  type RestaurantRecord,
} from '@/lib/types';

export type PlaceItem =
  | { id: string; entityType: 'event'; lat: number; lon: number; data: EventRecord }
  | { id: string; entityType: 'restaurant'; lat: number; lon: number; data: RestaurantRecord }
  | { id: string; entityType: 'business'; lat: number; lon: number; data: BusinessRecord }
  | { id: string; entityType: 'poi'; lat: number; lon: number; data: PoiRecord }
  | { id: string; entityType: 'org'; lat: number; lon: number; data: Account };

export function placeKey(item: Pick<PlaceItem, 'entityType' | 'id'>): string {
  return `${item.entityType}-${item.id}`;
}

export function getTitle(item: PlaceItem): string {
  switch (item.entityType) {
    case 'event':
      return item.data.title;
    case 'restaurant':
    case 'business':
      return item.data.name;
    case 'poi':
      return item.data.name_de;
    case 'org':
      return item.data.name;
  }
}

export function getSubtitle(item: PlaceItem): string {
  switch (item.entityType) {
    case 'event':
      return item.data.location || '';
    default:
      return item.data.address || '';
  }
}

export function getEmoji(item: PlaceItem): string {
  switch (item.entityType) {
    case 'event':
      return eventEmoji(item.data.category);
    case 'restaurant':
      return restaurantEmoji(item.data.slug, item.data.name);
    case 'business':
      return businessEmoji(item.data.slug, item.data.category);
    case 'poi':
      return poiEmoji(item.data.type);
    case 'org':
      return orgEmoji(item.data.sub_type);
  }
}

export function getCategoryLabel(item: PlaceItem): string {
  switch (item.entityType) {
    case 'event':
      return item.data.category || 'Veranstaltung';
    case 'restaurant':
      return 'Gastronomie';
    case 'business':
      return BUSINESS_CATEGORY_LABELS[item.data.category] || 'Sonstiges';
    case 'poi':
      return POI_TYPE_LABELS_DE[item.data.type] || item.data.type;
    case 'org':
      return (item.data.sub_type && SUB_TYPE_LABELS[item.data.sub_type]) || 'Organisation';
  }
}

export function getDescription(item: PlaceItem): string | null {
  switch (item.entityType) {
    case 'event':
      return item.data.description || null;
    case 'business':
      return item.data.description || null;
    case 'poi':
      return item.data.description_de || null;
    case 'org':
      return item.data.bio || null;
    default:
      return null;
  }
}

export function getOpeningHours(item: PlaceItem): OpeningHours | null {
  switch (item.entityType) {
    case 'restaurant':
    case 'business':
    case 'org':
      return item.data.opening_hours;
    default:
      return null;
  }
}

export function getPhone(item: PlaceItem): string | null {
  switch (item.entityType) {
    case 'business':
      return item.data.phone;
    case 'poi':
      return item.data.phone;
    default:
      return null;
  }
}

export function getWebsite(item: PlaceItem): string | null {
  switch (item.entityType) {
    case 'business':
      return item.data.website_url;
    case 'poi':
      return item.data.website;
    default:
      return null;
  }
}

/** The one picture for a thumbnail: cover first, then logo or avatar. */
export function getImageUrl(item: PlaceItem): string | null {
  switch (item.entityType) {
    case 'event':
      return item.data.image_url;
    case 'restaurant':
    case 'business':
      return item.data.cover_image_url || item.data.logo_url;
    case 'org':
      return item.data.cover_url || item.data.avatar_url;
    case 'poi':
      return null;
  }
}

/** Everything worth swiping through: uploaded gallery first, then the cover. */
export function getGalleryUrls(item: PlaceItem): string[] {
  const urls: (string | null | undefined)[] = [];
  if (item.entityType === 'business') urls.push(...(item.data.gallery_images ?? []));
  // The logo is a brand mark, not a photo — it stays a thumbnail only.
  if (item.entityType === 'restaurant' || item.entityType === 'business') {
    urls.push(item.data.cover_image_url);
  }
  if (item.entityType === 'event') urls.push(item.data.image_url);
  if (item.entityType === 'org') urls.push(item.data.cover_url, item.data.avatar_url);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

export function getButtonLabel(item: PlaceItem): string {
  switch (item.entityType) {
    case 'event':
      return 'Details';
    case 'restaurant':
      return 'Speisekarte';
    case 'business':
      return 'Mehr erfahren';
    case 'poi':
      return 'Details';
    case 'org':
      return 'Zum Profil';
  }
}
