/**
 * Pure helpers for the "Mittagstisch" and "Diese Woche" home-screen widgets (iOS
 * WidgetKit + Android): which dishes / events they show and the platform-neutral
 * payloads both widgets read. Side effects (queries, photos, OS reloads) live in
 * lib/widget-sync.ts.
 */
import type { EventRecord, SpecialMenuItemRecord } from './types';
import { dishDayLabel, resolveDishDay } from './special-menu-days';
import { formatMenuPrice, hasMenuPrice } from './utils';

/** Dishes per restaurant page (the large widget shows a 2×2 photo grid). */
export const WIDGET_LUNCH_MAX = 4;
/** Rows of the large events widget. */
export const WIDGET_EVENTS_MAX = 6;

export const LUNCH_PAYLOAD_KEY = 'widget.lunch.v1';
export const LUNCH_PAGE_KEY = 'widget.lunch.page.v1';
export const EVENTS_PAYLOAD_KEY = 'widget.events.v1';

export const WIDGET_LUNCH_URL = 'roebel://explore';
export const WIDGET_EVENTS_URL = 'roebel://events';

// ── Mittagstisch ──────────────────────────────────────────────────────────

/** The subset of a special menu (fetchActiveSpecialMenus) the widget needs. */
type MenuLike = {
  start_date: string | null;
  restaurant: { name: string } | null;
  special_menu_items?: (SpecialMenuItemRecord & { category: { name: string } | null })[] | null;
};

export type LunchDishRef = { item: SpecialMenuItemRecord; day: string | null };
export type LunchRestaurantPage = { restaurant: string; dishes: LunchDishRef[] };

/**
 * One page per restaurant (the widget's ‹ › buttons step through them). Same dish
 * rules as the Erkunden rail: past days dropped, soonest day first, undated last.
 * Restaurants are ordered by their soonest dish.
 */
export function selectLunchRestaurants(menus: MenuLike[], today: string): LunchRestaurantPage[] {
  const byRestaurant = new Map<string, LunchDishRef[]>();
  for (const menu of menus) {
    const name = menu.restaurant?.name ?? 'Mittagstisch';
    for (const item of menu.special_menu_items ?? []) {
      const day = resolveDishDay(item.category?.name, menu.start_date);
      if (day !== null && day < today) continue;
      const list = byRestaurant.get(name) ?? [];
      list.push({ item, day });
      byRestaurant.set(name, list);
    }
  }
  const dayKey = (d: LunchDishRef) => d.day ?? '9999';
  return [...byRestaurant.entries()]
    .map(([restaurant, dishes]) => ({
      restaurant,
      // Stable sort keeps menu + dish order within one day.
      dishes: [...dishes].sort((a, b) => dayKey(a).localeCompare(dayKey(b))).slice(0, WIDGET_LUNCH_MAX),
    }))
    .sort((a, b) => dayKey(a.dishes[0]).localeCompare(dayKey(b.dishes[0])));
}

export type WidgetLunchDish = {
  id: string;
  name: string;
  /** "11,00 €"; null when the restaurant publishes no prices. */
  price: string | null;
  /** "Heute", "Morgen", "Mi" … ('' for undated dishes). */
  day: string;
  /** Base64 JPEG without the data: prefix; null → plain tile. */
  image: string | null;
  url: string;
};
export type WidgetLunchRestaurant = { name: string; dishes: WidgetLunchDish[] };
export type LunchPayload = { v: 1; updatedAt: number; restaurants: WidgetLunchRestaurant[] };

export function dishDeepLink(id: string): string {
  return `roebel://restaurant/dish/${encodeURIComponent(id)}`;
}

export function buildLunchPayload(
  pages: LunchRestaurantPage[],
  images: Record<string, string | null>,
  today: string,
  now: number,
): LunchPayload {
  return {
    v: 1,
    updatedAt: now,
    restaurants: pages.map((p) => ({
      name: p.restaurant,
      dishes: p.dishes.map(({ item, day }) => ({
        id: item.id,
        name: item.name,
        price: hasMenuPrice(item.price) ? formatMenuPrice(item.price) : null,
        day: day ? dishDayLabel(day, today) : '',
        image: images[item.id] ?? null,
        url: dishDeepLink(item.id),
      })),
    })),
  };
}

/** Next page after a ‹ (-1) or › (+1) tap; wraps around, repairs a stale index. */
export function lunchPageIndex(current: number, count: number, step: number): number {
  if (count <= 0) return 0;
  const base = current >= 0 && current < count ? current : 0;
  return (((base + step) % count) + count) % count;
}

// ── Diese Woche ───────────────────────────────────────────────────────────

const WEEKDAY_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

export type WidgetEvent = {
  id: string;
  title: string;
  /** "Fr" */
  weekday: string;
  /** "24" */
  day: string;
  /** "19:00"; null when the event has no start time. */
  time: string | null;
  location: string;
  url: string;
};
export type EventsPayload = { v: 1; updatedAt: number; events: WidgetEvent[] };

export function eventDeepLink(id: string): string {
  return `roebel://event/${encodeURIComponent(id)}`;
}

/** `events` = the "Diese Woche" bucket from partitionExploreEvents (already in order). */
export function buildEventsPayload(events: EventRecord[], now: number): EventsPayload {
  return {
    v: 1,
    updatedAt: now,
    events: events
      .filter((e) => !e.is_cancelled)
      .slice(0, WIDGET_EVENTS_MAX)
      .map((e) => {
        const [y, m, d] = e.date.split('-').map(Number);
        return {
          id: e.id,
          title: e.title,
          weekday: WEEKDAY_SHORT[new Date(y, m - 1, d).getDay()],
          day: String(d),
          time: e.time ? e.time.slice(0, 5) : null,
          location: e.location,
          url: eventDeepLink(e.id),
        };
      }),
  };
}
