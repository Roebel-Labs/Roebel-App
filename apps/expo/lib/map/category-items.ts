/**
 * What each map category lists.
 *
 * The map already holds every place; this module only decides which of them
 * belong under Essen, Cafés, Bars and so on, and in what order. Kept pure so
 * the rules are testable and a category can change without touching the
 * sheet component.
 *
 * Restaurants also exist as `gastronomie` businesses (the same place, two
 * rows), so every gastronomy list is deduplicated by name with the restaurant
 * row winning — it is the one that links to the Speisekarte.
 */
import type { EventWithCoordinates, OrgWithCoordinates } from '@/lib/map/geojson';
import type { MapCategoryKey } from '@/lib/map/categories';
import { accountIdForPin, type OrgIndex } from '@/lib/map/org-lookup';
import { getImageUrl, type PlaceItem } from '@/lib/map/place-item';
import type {
  AccountSaveSummary,
  AccountVoteSummary,
  BusinessRecord,
  RestaurantRecord,
} from '@/lib/types';

export type CategorySources = {
  events: EventWithCoordinates[];
  restaurants: RestaurantRecord[];
  businesses: BusinessRecord[];
  orgs: OrgWithCoordinates[];
};

export type CategoryOptions = {
  orgIndex: OrgIndex;
  /** Community score per `accounts.id` — see scoresFromSummaries. */
  scores: Record<string, number>;
  now: Date;
};

export const RECOMMENDATION_LIMIT = 12;

const CAFE_PATTERN = /caf[eé]|kaffee|konditor|torte|b[äa]cker|eisdiele|eiscaf|\btee\b|teestube/i;
// A standalone "Bar" word, or the usual German compounds ending in -bar.
// "Tortenbar" is deliberately not one — it is a café, caught above.
const BAR_PATTERN =
  /(?:^|[\s\-&/])bar\b|(?:sports?|hafen|strand|cocktail|wein|bier|schnaps|whisky|gin|tapas|shisha|rooftop|see)bar\b|kneipe|\bpub\b|lounge|cocktail|biergarten|brauhaus|taverne/i;
const LODGING_PATTERN =
  /hotel|pension|ferienwohnung|ferienhaus|ferienzimmer|\bzimmer\b|camping|hostel|apartment|appartement|[üu]bernacht|g[äa]stehaus|herberge|unterkunft/i;

function text(name: string, description: string | null | undefined): string {
  return `${name} ${description ?? ''}`;
}

export function isCafe(name: string, description: string | null | undefined): boolean {
  return CAFE_PATTERN.test(text(name, description));
}

export function isBar(name: string, description: string | null | undefined): boolean {
  return BAR_PATTERN.test(text(name, description));
}

export function isLodging(name: string, description: string | null | undefined): boolean {
  return LODGING_PATTERN.test(text(name, description));
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function hasCoordinates<T extends { latitude: number | null; longitude: number | null }>(
  row: T
): row is T & { latitude: number; longitude: number } {
  return row.latitude != null && row.longitude != null;
}

function restaurantItem(r: RestaurantRecord & { latitude: number; longitude: number }): PlaceItem {
  return { id: r.id, entityType: 'restaurant', lat: r.latitude, lon: r.longitude, data: r };
}

function businessItem(b: BusinessRecord & { latitude: number; longitude: number }): PlaceItem {
  return { id: b.id, entityType: 'business', lat: b.latitude, lon: b.longitude, data: b };
}

function eventItem(e: EventWithCoordinates): PlaceItem {
  return { id: e.id, entityType: 'event', lat: e.latitude, lon: e.longitude, data: e };
}

function orgItem(o: OrgWithCoordinates): PlaceItem {
  return { id: o.id, entityType: 'org', lat: o.latitude, lon: o.longitude, data: o };
}

/**
 * Restaurants plus gastronomy businesses, one entry per place name. Optional
 * predicate keeps only matching places — evaluated per row, so a business
 * twin with a richer description can qualify where the restaurant row did
 * not, without the pair appearing twice.
 */
function gastronomyPlaces(
  sources: CategorySources,
  keep: (name: string, description: string | null) => boolean = () => true
): PlaceItem[] {
  const out: PlaceItem[] = [];
  const seen = new Set<string>();
  for (const r of sources.restaurants) {
    if (!hasCoordinates(r) || !keep(r.name, r.description)) continue;
    seen.add(normalizeName(r.name));
    out.push(restaurantItem(r));
  }
  for (const b of sources.businesses) {
    if (b.category !== 'gastronomie' || !hasCoordinates(b)) continue;
    const key = normalizeName(b.name);
    if (seen.has(key) || !keep(b.name, b.description)) continue;
    seen.add(key);
    out.push(businessItem(b));
  }
  return out;
}

/** Same dedupe, but across every business category — for lodging. */
function allPlaces(
  sources: CategorySources,
  keep: (name: string, description: string | null) => boolean
): PlaceItem[] {
  const out: PlaceItem[] = [];
  const seen = new Set<string>();
  for (const r of sources.restaurants) {
    if (!hasCoordinates(r) || !keep(r.name, r.description)) continue;
    seen.add(normalizeName(r.name));
    out.push(restaurantItem(r));
  }
  for (const b of sources.businesses) {
    if (!hasCoordinates(b)) continue;
    const key = normalizeName(b.name);
    if (seen.has(key) || !keep(b.name, b.description)) continue;
    seen.add(key);
    out.push(businessItem(b));
  }
  return out;
}

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function upcomingEvents(events: EventWithCoordinates[], now: Date): PlaceItem[] {
  const today = localDateKey(now);
  return events
    .filter((e) => !e.is_cancelled && e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''))
    .map(eventItem);
}

function shops(sources: CategorySources): PlaceItem[] {
  return sources.businesses
    .filter((b) => b.category !== 'gastronomie')
    .filter(hasCoordinates)
    .map(businessItem);
}

function isFeatured(item: PlaceItem): boolean {
  return (
    (item.entityType === 'restaurant' || item.entityType === 'business') && !!item.data.is_featured
  );
}

function recommendations(sources: CategorySources, opts: CategoryOptions): PlaceItem[] {
  const candidates = [...gastronomyPlaces(sources), ...shops(sources), ...sources.orgs.map(orgItem)];
  const score = (item: PlaceItem): number => {
    const accountId = accountIdForPin(opts.orgIndex, item.entityType, item.id);
    return accountId ? (opts.scores[accountId] ?? 0) : 0;
  };
  return candidates
    .map((item, index) => ({ item, index, score: score(item) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(isFeatured(b.item)) - Number(isFeatured(a.item)) ||
        Number(!!getImageUrl(b.item)) - Number(!!getImageUrl(a.item)) ||
        a.index - b.index
    )
    .slice(0, RECOMMENDATION_LIMIT)
    .map((entry) => entry.item);
}

export function itemsForCategory(
  key: MapCategoryKey,
  sources: CategorySources,
  opts: CategoryOptions
): PlaceItem[] {
  switch (key) {
    case 'essen':
      return gastronomyPlaces(sources);
    case 'cafes':
      return gastronomyPlaces(sources, isCafe);
    case 'bars':
      return gastronomyPlaces(sources, isBar);
    case 'ausgehen':
      return upcomingEvents(sources.events, opts.now);
    case 'shops':
      return shops(sources);
    case 'uebernachten':
      return allPlaces(sources, isLodging);
    case 'empfehlungen':
      return recommendations(sources, opts);
  }
}

/**
 * One number per account from the two community summaries: every thumbs-up
 * and every save counts one, a thumbs-down takes one away.
 */
export function scoresFromSummaries(
  votes: AccountVoteSummary[],
  saves: AccountSaveSummary[]
): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const v of votes) {
    scores[v.account_id] = (scores[v.account_id] ?? 0) + v.up_count - v.down_count;
  }
  for (const s of saves) {
    scores[s.account_id] = (scores[s.account_id] ?? 0) + s.save_count;
  }
  return scores;
}
