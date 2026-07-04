/**
 * Mini App registry + telemetry — the Expo host's data layer for the
 * Netizen Mini App platform (spec §5①, §3.5).
 *
 * - `fetchLiveMiniApps()` / `fetchMiniAppBySlug()` read `mini_apps where status='live'`
 *   from Supabase (anon client — RLS "mini_apps read live" allows this).
 * - `trackMiniAppEvent()` fires-and-forgets a row into `mini_app_events`
 *   (RLS allows anon insert). Never throws, never blocks the caller.
 *
 * DB rows are mapped to a typed `MiniApp` that reuses the frozen SDK manifest
 * shape (`MiniAppCategory` / `MiniAppPermission` from `@netizen-labs/miniapp-sdk`).
 */
import { supabase } from '@/lib/supabase';
import type {
  MiniAppCategory,
  MiniAppPermission,
} from '@netizen-labs/miniapp-sdk';

/** A live mini app as the Expo store consumes it (subset of the `mini_apps` row). */
export interface MiniApp {
  id: string;
  slug: string;
  name: string;
  iconUrl: string | null;
  homeUrl: string;
  description: string | null;
  category: MiniAppCategory;
  tags: string[];
  screenshots: string[];
  permissions: MiniAppPermission[];
  primaryColor: string;
  featured: boolean;
  /** Resolved developer/author display name, if the join returns one. */
  authorName: string | null;
}

/** Raw shape of a `mini_apps` row (only the columns we select). */
interface MiniAppRow {
  id: string;
  slug: string;
  name: string;
  icon_url: string | null;
  home_url: string;
  description: string | null;
  category: string | null;
  tags: string[] | null;
  screenshots: string[] | null;
  permissions: string[] | null;
  primary_color: string | null;
  featured: boolean | null;
  status: string;
  developers?: { display_name: string | null } | { display_name: string | null }[] | null;
}

const DEFAULT_PRIMARY = '#00498B';

const VALID_CATEGORIES: MiniAppCategory[] = [
  'community',
  'governance',
  'finance',
  'utility',
  'games',
  'education',
  'news',
  'culture',
  'environment',
];

const VALID_PERMISSIONS: MiniAppPermission[] = [
  'wallet',
  'rewards',
  'notifications',
  'circles',
  'share',
];

function coerceCategory(raw: string | null): MiniAppCategory {
  return (VALID_CATEGORIES as string[]).includes(raw ?? '')
    ? (raw as MiniAppCategory)
    : 'utility';
}

function coercePermissions(raw: string[] | null): MiniAppPermission[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((p): p is MiniAppPermission =>
    (VALID_PERMISSIONS as string[]).includes(p),
  );
}

function resolveAuthorName(dev: MiniAppRow['developers']): string | null {
  if (!dev) return null;
  const row = Array.isArray(dev) ? dev[0] : dev;
  return row?.display_name ?? null;
}

function mapRow(row: MiniAppRow): MiniApp {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    iconUrl: row.icon_url,
    homeUrl: row.home_url,
    description: row.description,
    category: coerceCategory(row.category),
    tags: Array.isArray(row.tags) ? row.tags : [],
    screenshots: Array.isArray(row.screenshots) ? row.screenshots : [],
    permissions: coercePermissions(row.permissions),
    primaryColor: row.primary_color || DEFAULT_PRIMARY,
    featured: !!row.featured,
    authorName: resolveAuthorName(row.developers),
  };
}

const SELECT_COLUMNS =
  'id, slug, name, icon_url, home_url, description, category, tags, screenshots, permissions, primary_color, featured, status, developers(display_name)';

/** Fetch every live mini app (featured first, then newest). Returns [] on error. */
export async function fetchLiveMiniApps(): Promise<MiniApp[]> {
  try {
    const { data, error } = await supabase
      .from('mini_apps')
      .select(SELECT_COLUMNS)
      .eq('status', 'live')
      .order('featured', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[miniapps] fetchLiveMiniApps failed:', error.message);
      return [];
    }
    return ((data ?? []) as unknown as MiniAppRow[]).map(mapRow);
  } catch (e) {
    console.warn('[miniapps] fetchLiveMiniApps threw:', e);
    return [];
  }
}

/** Fetch a single live mini app by slug. Returns null if not found / not live. */
export async function fetchMiniAppBySlug(slug: string): Promise<MiniApp | null> {
  try {
    const { data, error } = await supabase
      .from('mini_apps')
      .select(SELECT_COLUMNS)
      .eq('slug', slug)
      .eq('status', 'live')
      .maybeSingle();

    if (error) {
      console.warn('[miniapps] fetchMiniAppBySlug failed:', error.message);
      return null;
    }
    return data ? mapRow(data as unknown as MiniAppRow) : null;
  } catch (e) {
    console.warn('[miniapps] fetchMiniAppBySlug threw:', e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Telemetry — mini_app_events
// ---------------------------------------------------------------------------

/** Canonical event names the host emits (spec §3.5). `<custom>` also allowed. */
export type MiniAppEventName =
  | 'app_open'
  | 'tab_view'
  | 'wallet_connect'
  | 'reward_granted'
  | 'heartbeat'
  | (string & {});

export interface TrackMiniAppEventArgs {
  miniAppId?: string | null;
  slug?: string | null;
  sessionId: string;
  wallet?: string | null;
  event: MiniAppEventName;
  ref?: string | null;
  props?: Record<string, unknown>;
}

/**
 * Fire-and-forget insert into `mini_app_events`. Never throws; swallows all
 * errors so telemetry can never break the host. Wallet is lowercased.
 */
export function trackMiniAppEvent(args: TrackMiniAppEventArgs): void {
  const row = {
    mini_app_id: args.miniAppId ?? null,
    slug: args.slug ?? null,
    session_id: args.sessionId,
    wallet: args.wallet ? args.wallet.toLowerCase() : null,
    event: args.event,
    ref: args.ref ?? null,
    props: args.props ?? {},
  };
  // Fire-and-forget: run in a detached async IIFE and swallow all errors so
  // telemetry can never break the host. Matches the app's `await supabase…` idiom.
  void (async () => {
    try {
      // `mini_app_events` is a new table not yet in the generated Supabase
      // types, so the typed client narrows its insert arg to `never`. Cast the
      // builder — this is the repo's convention for not-yet-typed tables.
      const { error } = await (supabase.from('mini_app_events') as any).insert(row);
      if (error) console.warn('[miniapps] trackMiniAppEvent error:', error.message);
    } catch (e) {
      console.warn('[miniapps] trackMiniAppEvent threw:', e);
    }
  })();
}

/** Generate an opaque session id for one host session. */
export function newMiniAppSessionId(): string {
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
