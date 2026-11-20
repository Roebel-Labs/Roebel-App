/**
 * Mittagstisch + "Events" widget sync: fetch, shrink dish photos, store the
 * payloads (Android redraws from storage, e.g. on a ‹ › tap) and hand them to the OS
 * (lib/widget-platform.{ios,android}.ts). Never throws — a failed sync leaves the last
 * payload on the home screen. Runs alongside the Mini Apps sync in lib/widget-sync.ts.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { supabase } from './supabase';
import { fetchActiveSpecialMenus } from './supabase-restaurants';
import { isEventInRoebel } from './utils';
import { toIsoDay } from './special-menu-days';
import type { EventRecord } from './types';
import {
  buildEventsPayload,
  WIDGET_EVENTS_MAX,
  buildLunchPayload,
  EVENTS_PAYLOAD_KEY,
  LUNCH_PAGE_KEY,
  LUNCH_PAYLOAD_KEY,
  lunchPageIndex,
  selectLunchRestaurants,
  type EventsPayload,
  type LunchPayload,
} from './widget-content';
import { pushEventsToPlatform, pushLunchToPlatform } from './widget-platform';

/** Dish photo width in the payload. 2× a medium-widget tile; ~15 kB as JPEG. */
const PHOTO_WIDTH = 320;
/** Photo of the next event (2×2 widget, hero card of the large one); ~30 kB as JPEG. */
const HERO_WIDTH = 560;

const EVENT_COLUMNS =
  'id, title, date, time, location, formatted_address, address_components, image_url, is_popular, is_cancelled';

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export const readLunchPayload = () => readJson<LunchPayload>(LUNCH_PAYLOAD_KEY);
export const readEventsPayload = () => readJson<EventsPayload>(EVENTS_PAYLOAD_KEY);

export async function readLunchPage(): Promise<number> {
  try {
    return Number((await AsyncStorage.getItem(LUNCH_PAGE_KEY)) ?? 0) || 0;
  } catch {
    return 0;
  }
}

/** ‹ / › on the Android widget (iOS keeps its own page in the App Group). */
export async function stepLunchPage(step: number): Promise<{ payload: LunchPayload | null; page: number }> {
  const payload = await readLunchPayload();
  const page = lunchPageIndex(await readLunchPage(), payload?.restaurants.length ?? 0, step);
  await AsyncStorage.setItem(LUNCH_PAGE_KEY, String(page)).catch(() => {});
  return { payload, page };
}

const photoCache = new Map<string, string | null>();

async function loadPhoto(url: string | null | undefined, width = PHOTO_WIDTH): Promise<string | null> {
  if (!url) return null;
  const key = `${width}:${url}`;
  if (photoCache.has(key)) return photoCache.get(key) ?? null;
  let result: string | null = null;
  try {
    const dir = new Directory(Paths.cache, 'widget-photos');
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const file = await File.downloadFileAsync(url, dir, { idempotent: true });
    const ref = await ImageManipulator.manipulate(file.uri).resize({ width }).renderAsync();
    const saved = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
    result = saved.base64 ?? null;
    try {
      file.delete();
    } catch {}
  } catch {
    result = null;
  }
  photoCache.set(key, result);
  return result;
}

async function syncLunch(): Promise<void> {
  const menus = await fetchActiveSpecialMenus(20);
  const today = toIsoDay(new Date());
  const pages = selectLunchRestaurants(menus, today);
  const photos: Record<string, string | null> = {};
  await Promise.all(
    pages.flatMap((p) =>
      p.dishes.map(async ({ item }) => {
        photos[item.id] = await loadPhoto(item.image_thumb_url || item.image_url);
      }),
    ),
  );
  const payload = buildLunchPayload(pages, photos, today, Date.now());
  await AsyncStorage.setItem(LUNCH_PAYLOAD_KEY, JSON.stringify(payload)).catch(() => {});
  await pushLunchToPlatform(payload, await readLunchPage());
}

async function syncEvents(): Promise<void> {
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_COLUMNS)
    .eq('status', 'approved')
    .gte('date', toIsoDay(new Date()))
    .order('date', { ascending: true })
    .order('time', { ascending: true, nullsFirst: true })
    .limit(60);
  if (error) return; // offline: keep what the widget shows
  // Upcoming events in Röbel (the widget is "Events in Röbel"); the query already sorts them.
  const upcoming = ((data ?? []) as unknown as EventRecord[])
    .filter((e) => !e.is_cancelled && isEventInRoebel(e.location, e.formatted_address, e.address_components))
    .slice(0, WIDGET_EVENTS_MAX);
  const hero = upcoming[0] ? await loadPhoto(upcoming[0].image_url, HERO_WIDTH) : null;
  const payload = buildEventsPayload(upcoming, Date.now(), hero);
  await AsyncStorage.setItem(EVENTS_PAYLOAD_KEY, JSON.stringify(payload)).catch(() => {});
  await pushEventsToPlatform(payload);
}

export async function syncContentWidgets(): Promise<void> {
  await Promise.all([
    syncLunch().catch((e) => console.warn('[widget] lunch sync failed:', e)),
    syncEvents().catch((e) => console.warn('[widget] events sync failed:', e)),
  ]);
}
