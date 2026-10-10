import { isRestaurantOpen } from '@/lib/utils';
import type { OpeningHours } from '@/lib/types';

export type MapFilterState = {
  events: boolean;
  restaurants: boolean;
  businesses: boolean;
  orgs: boolean;
  pois: boolean;
  openNow: boolean;
  /** "Stablecoin" chip -- keeps only places with a live merchant Konto. */
  acceptsStablecoin: boolean;
  /**
   * Every upcoming event instead of only the next MAP_EVENT_WINDOW_DAYS.
   * Set by the "Ausgehen" category, whose sheet lists them all.
   */
  allEvents: boolean;
};

/**
 * The calm default: what's on soon, food and shops. Vereine and tips are
 * opt-in chips — they have their own lists and would otherwise double the
 * pin count in the old town.
 */
export const DEFAULT_MAP_FILTER: MapFilterState = {
  events: true,
  restaurants: true,
  businesses: true,
  orgs: false,
  pois: false,
  openNow: false,
  acceptsStablecoin: false,
  allEvents: false,
};

/** Deep link from an org profile: places + Vereine, no events. */
export const ORGS_MAP_FILTER: MapFilterState = {
  ...DEFAULT_MAP_FILTER,
  events: false,
  orgs: true,
};

/**
 * "Jetzt geöffnet" — keeps only places whose opening hours say they are open
 * right now. Places without opening hours are treated as closed (a place that
 * never told us its hours shouldn't pass an explicit open-now filter).
 */
export function filterOpenNow<T extends { opening_hours: OpeningHours | null }>(
  items: T[],
  enabled: boolean
): T[] {
  if (!enabled) return items;
  return items.filter((item) => isRestaurantOpen(item.opening_hours).isOpen);
}
