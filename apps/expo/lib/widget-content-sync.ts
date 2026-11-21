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

/**
 * Longest side of a dish photo in px: a large-widget tile is ~170 dp ≈ 510 px on a
 * 3× screen. Sharp, still ~40 kB as JPEG.
 */
const PHOTO_MAX = 560;
/** Longest side of the next event's photo/flyer (hero card ≈ 330 × 180 dp). */
const HERO_MAX = 1080;
/** Edge of the tiny copy Android scales up as the blurred flyer backdrop. */
const BLUR_EDGE = 24;

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

type Photo = { data: string; aspect: number; blur?: string };

const photoCache = new Map<string, Photo | null>();

/**
 * Downloads a photo, shrinks it so its longest side is ≤ `maxSide` (aspect kept —
 * the widgets crop or letterbox it themselves) and returns base64 JPEG + aspect.
 * `withBlur` adds a ~24 px copy for the blurred flyer backdrop.
 */
async function loadPhoto(url: string | null | undefined, maxSide = PHOTO_MAX, withBlur = false): Promise<Photo | null> {
  if (!url) return null;
  const key = `${maxSide}:${withBlur ? 'b' : ''}:${url}`;
  if (photoCache.has(key)) return photoCache.get(key) ?? null;
  let result: Photo | null = null;
  try {
    const dir = new Directory(Paths.cache, 'widget-photos');
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const file = await File.downloadFileAsync(url, dir, { idempotent: true });
    const src = await ImageManipulator.manipulate(file.uri).renderAsync();
    const landscape = src.width >= src.height;
    const ctx = ImageManipulator.manipulate(src);
    if (Math.max(src.width, src.height) > maxSide) ctx.resize(landscape ? { width: maxSide } : { height: maxSide });
    const ref = await ctx.renderAsync();
    const saved = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.82, base64: true });
    if (saved.base64 && src.width > 0 && src.height > 0) {
      result = { data: saved.base64, aspect: Math.round((src.width / src.height) * 1000) / 1000 };
      if (withBlur) {
        const tiny = await ImageManipulator.manipulate(src)
          .resize(landscape ? { width: BLUR_EDGE } : { height: BLUR_EDGE })
          .renderAsync();
        const t = await tiny.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
        if (t.base64) result.blur = t.base64;
      }
    }
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
  const aspects: Record<string, number> = {};
  await Promise.all(
    pages.flatMap((p) =>
      p.dishes.map(async ({ item }) => {
        // The full image first: thumbnails are too small for a sharp widget tile.
        const photo = await loadPhoto(item.image_url || item.image_thumb_url);
        photos[item.id] = photo?.data ?? null;
        if (photo) aspects[item.id] = photo.aspect;
      }),
    ),
  );
  const payload = buildLunchPayload(pages, photos, today, Date.now(), aspects);
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
  const hero = upcoming[0] ? await loadPhoto(upcoming[0].image_url, HERO_MAX, true) : null;
  const payload = buildEventsPayload(upcoming, Date.now(), hero?.data ?? null, { aspect: hero?.aspect, blur: hero?.blur });
  await AsyncStorage.setItem(EVENTS_PAYLOAD_KEY, JSON.stringify(payload)).catch(() => {});
  await pushEventsToPlatform(payload);
}

export async function syncContentWidgets(): Promise<void> {
  await Promise.all([
    syncLunch().catch((e) => console.warn('[widget] lunch sync failed:', e)),
    syncEvents().catch((e) => console.warn('[widget] events sync failed:', e)),
  ]);
}
