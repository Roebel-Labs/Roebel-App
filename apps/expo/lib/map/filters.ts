import { isRestaurantOpen } from '@/lib/utils';
import type { OpeningHours } from '@/lib/types';

export type MapFilterState = {
  events: boolean;
  restaurants: boolean;
  businesses: boolean;
  orgs: boolean;
  pois: boolean;
  openNow: boolean;
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
