/**
 * Home-screen widget sync: the user's mini-app selection (Einstellungen → Widget),
 * icon preparation, unread flags, and the hand-off to the OS widget
 * (lib/widget-platform.{ios,android}.ts). Never throws — a failed sync leaves the
 * last payload on the home screen.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { supabase } from './supabase';
import { fetchLiveMiniApps, type MiniApp } from './miniapps';
import { getInstalledMiniAppSlugs } from './miniapp-installs';
import { buildPayload, resolveSelection, WIDGET_MAX_APPS, type WidgetPayload } from './widget-payload';
import { pushToPlatform } from './widget-platform';
import { clearUnreadMiniApp, setUnreadMiniApps } from './miniapp-unread';
import { syncContentWidgets } from './widget-content-sync';

export { useMiniAppUnread } from './miniapp-unread';

export const SELECTION_KEY = 'widget.miniapps.v1';
export const PAYLOAD_KEY = 'widget.payload.v1';
export const WALLET_KEY = 'widget.wallet.v1';
const ICON_SIZE = 96;

/** null = the user never chose (widget falls back to installed / featured apps). */
export async function getWidgetSelection(): Promise<string[] | null> {
  try {
    const raw = await AsyncStorage.getItem(SELECTION_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : null;
  } catch {
    return null;
  }
}

export async function setWidgetSelection(slugs: string[], wallet: string | null): Promise<void> {
  try {
    await AsyncStorage.setItem(SELECTION_KEY, JSON.stringify(slugs.slice(0, WIDGET_MAX_APPS)));
  } catch {
    // Best-effort; the widget keeps its previous apps.
  }
  await syncWidget(wallet);
}

export async function readStoredPayload(): Promise<WidgetPayload | null> {
  try {
    const raw = await AsyncStorage.getItem(PAYLOAD_KEY);
    return raw ? (JSON.parse(raw) as WidgetPayload) : null;
  } catch {
    return null;
  }
}

/** The wallet the last sync ran for — lets the Android background refresh re-query unread. */
export async function getStoredWidgetWallet(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(WALLET_KEY);
  } catch {
    return null;
  }
}

// ── Unread ────────────────────────────────────────────────────────────────

/** Slugs of mini apps with unread notifications for this wallet (one query). */
export async function fetchUnreadMiniAppSlugs(wallet: string): Promise<Set<string>> {
  try {
    const { data, error } = await (supabase.from('notifications') as any)
      .select('metadata')
      .eq('recipient_wallet', wallet.toLowerCase())
      .eq('type', 'mini_app')
      .eq('is_read', false)
      .limit(500);
    if (error || !Array.isArray(data)) return new Set();
    const slugs = new Set<string>();
    for (const row of data as { metadata?: { slug?: unknown } | null }[]) {
      const slug = row.metadata?.slug;
      if (typeof slug === 'string') slugs.add(slug);
    }
    return slugs;
  } catch {
    return new Set();
  }
}

/** Opening a mini app clears its dot. */
export async function markMiniAppNotificationsRead(wallet: string, slug: string): Promise<void> {
  try {
    await (supabase.from('notifications') as any)
      .update({ is_read: true })
      .eq('recipient_wallet', wallet.toLowerCase())
      .eq('type', 'mini_app')
      .eq('is_read', false)
      .eq('metadata->>slug', slug);
  } catch {
    // The dot simply stays until the next successful open.
  }
  clearUnreadMiniApp(slug);
}

// ── Icons ─────────────────────────────────────────────────────────────────

const iconCache = new Map<string, string | null>();

/** Downloads + shrinks an icon to a 96 px PNG (base64). null on any failure → letter tile. */
async function loadIcon(url: string | null): Promise<string | null> {
  if (!url) return null;
  if (iconCache.has(url)) return iconCache.get(url) ?? null;
  let result: string | null = null;
  try {
    const dir = new Directory(Paths.cache, 'widget-icons');
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const file = await File.downloadFileAsync(url, dir, { idempotent: true });
    const ref = await ImageManipulator.manipulate(file.uri)
      .resize({ width: ICON_SIZE, height: ICON_SIZE })
      .renderAsync();
    const saved = await ref.saveAsync({ format: SaveFormat.PNG, base64: true });
    result = saved.base64 ?? null;
    try {
      file.delete();
    } catch {}
  } catch {
    result = null;
  }
  iconCache.set(url, result);
  return result;
}

// ── Sync ──────────────────────────────────────────────────────────────────

let inFlight: Promise<WidgetPayload | null> | null = null;
let queued: string | null | undefined;

/**
 * Rebuilds every widget payload (Mini Apps, Mittagstisch, Diese Woche) and hands them
 * to the OS. Concurrent calls coalesce: one run at a time, the latest wallet runs once
 * more afterwards. Resolves with the Mini Apps payload.
 */
export function syncWidget(wallet: string | null): Promise<WidgetPayload | null> {
  if (inFlight) {
    queued = wallet;
    return inFlight;
  }
  inFlight = Promise.all([runSync(wallet), syncContentWidgets()])
    .then(([payload]) => payload)
    .finally(() => {
      inFlight = null;
      if (queued !== undefined) {
        const next = queued;
        queued = undefined;
        void syncWidget(next);
      }
    });
  return inFlight;
}

async function runSync(wallet: string | null): Promise<WidgetPayload | null> {
  try {
    let live: MiniApp[];
    try {
      live = await fetchLiveMiniApps();
    } catch {
      return null; // offline: keep what the widget shows
    }
    const [selected, installed, unread] = await Promise.all([
      getWidgetSelection(),
      getInstalledMiniAppSlugs().catch(() => [] as string[]),
      wallet ? fetchUnreadMiniAppSlugs(wallet) : Promise.resolve(new Set<string>()),
    ]);
    setUnreadMiniApps(unread);

    const apps = resolveSelection(selected, installed, live);
    const icons: Record<string, string | null> = {};
    await Promise.all(apps.map(async (a) => (icons[a.slug] = await loadIcon(a.iconUrl))));
    const payload = buildPayload(apps, icons, unread, Date.now());

    await AsyncStorage.multiSet([
      [PAYLOAD_KEY, JSON.stringify(payload)],
      [WALLET_KEY, wallet ? wallet.toLowerCase() : ''],
    ]).catch(() => {});
    await pushToPlatform(payload);
    return payload;
  } catch (e) {
    console.warn('[widget] sync failed:', e);
    return null;
  }
}
