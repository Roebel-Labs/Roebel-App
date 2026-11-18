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
  CredentialRequest,
  DeclaredContract,
  MiniAppCategory,
  MiniAppIdentityRequest,
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
  /** Hero artwork for the store's featured carousel (gray placeholder if null). */
  featureImageUrl: string | null;
  /** ISO timestamp — powers the "Neu & bemerkenswert" section. */
  createdAt: string;
  /** Resolved developer/author display name, if the join returns one. */
  authorName: string | null;
  /** Developer preview (settings → dev mini app): permissions are simulated. */
  preview?: boolean;
  /** Manifest version; 1 when the row predates the identity migration. */
  manifestVersion: 1 | 2;
  /** The version-2 `identity` section; always null for version 1. */
  identity: MiniAppIdentityRequest | null;
  /** The version-2 `contracts` declaration (labels for the confirm sheet); [] for version 1. */
  contracts: DeclaredContract[];
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
  feature_image_url: string | null;
  created_at: string | null;
  status: string;
  /** Absent until the identity migration is applied. */
  manifest_version?: string | null;
  identity?: unknown;
  /** Absent until the contracts migration is applied. */
  contracts?: unknown;
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

function coerceIdentity(raw: unknown): MiniAppIdentityRequest | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const credentials: CredentialRequest[] = Array.isArray(r.credentials)
    ? r.credentials.filter(
        (c): c is CredentialRequest =>
          !!c &&
          typeof c === 'object' &&
          typeof (c as CredentialRequest).type === 'string' &&
          typeof (c as CredentialRequest).reason === 'string',
      ).map((c) => ({ type: c.type, reason: c.reason }))
    : [];
  return { profile: r.profile === true, address: r.address === true, credentials };
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function coerceContracts(raw: unknown): DeclaredContract[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (c): c is DeclaredContract =>
        !!c &&
        typeof c === 'object' &&
        typeof (c as DeclaredContract).address === 'string' &&
        ADDRESS_RE.test((c as DeclaredContract).address) &&
        typeof (c as DeclaredContract).label === 'string' &&
        Array.isArray((c as DeclaredContract).functions),
    )
    .map((c) => ({
      address: c.address.toLowerCase(),
      label: c.label,
      functions: c.functions.filter((f): f is string => typeof f === 'string'),
    }));
}

export function mapMiniAppRow(row: MiniAppRow): MiniApp {
  const manifestVersion: 1 | 2 = row.manifest_version === '2' ? 2 : 1;
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
    featureImageUrl: row.feature_image_url,
    createdAt: row.created_at ?? '',
    authorName: resolveAuthorName(row.developers),
    manifestVersion,
    identity: manifestVersion === 2 ? coerceIdentity(row.identity) : null,
    contracts: manifestVersion === 2 ? coerceContracts(row.contracts) : [],
  };
}

const LEGACY_SELECT_COLUMNS =
  'id, slug, name, icon_url, home_url, description, category, tags, screenshots, permissions, primary_color, featured, feature_image_url, created_at, status, developers(display_name)';
const IDENTITY_SELECT_COLUMNS = `${LEGACY_SELECT_COLUMNS}, manifest_version, identity`;
const SELECT_COLUMNS = `${IDENTITY_SELECT_COLUMNS}, contracts`;
/** Tried in order while a column is missing (contracts migration, then identity migration). */
const SELECT_FALLBACKS = [SELECT_COLUMNS, IDENTITY_SELECT_COLUMNS, LEGACY_SELECT_COLUMNS];

/** PostgREST "column does not exist": a migration is not applied yet. */
function isMissingColumn(error: { code?: string } | null): boolean {
  return error?.code === '42703';
}

type SelectResult = { data: unknown; error: { code?: string; message: string } | null };

/** Run `query` with the full column list, falling back to older lists on a missing column. */
export async function selectWithColumnFallback(
  query: (columns: string) => PromiseLike<SelectResult>,
): Promise<SelectResult> {
  let result = await query(SELECT_FALLBACKS[0]);
  for (let i = 1; i < SELECT_FALLBACKS.length && isMissingColumn(result.error); i++) {
    result = await query(SELECT_FALLBACKS[i]);
  }
  return result;
}

/** Fetch every live mini app (featured first, then newest). Returns [] on error. */
export async function fetchLiveMiniApps(): Promise<MiniApp[]> {
  try {
    const query = (columns: string) =>
      supabase
        .from('mini_apps')
        .select(columns)
        .eq('status', 'live')
        .order('featured', { ascending: false })
        .order('created_at', { ascending: false });
    const { data, error } = await selectWithColumnFallback(query);

    if (error) {
      console.warn('[miniapps] fetchLiveMiniApps failed:', error.message);
      return [];
    }
    return ((data ?? []) as unknown as MiniAppRow[]).map(mapMiniAppRow);
  } catch (e) {
    console.warn('[miniapps] fetchLiveMiniApps threw:', e);
    return [];
  }
}

/** Fetch a single live mini app by slug. Returns null if not found / not live. */
export async function fetchMiniAppBySlug(slug: string): Promise<MiniApp | null> {
  try {
    const query = (columns: string) =>
      supabase.from('mini_apps').select(columns).eq('slug', slug).eq('status', 'live').maybeSingle();
    const { data, error } = await selectWithColumnFallback(query);

    if (error) {
      console.warn('[miniapps] fetchMiniAppBySlug failed:', error.message);
      return null;
    }
    return data ? mapMiniAppRow(data as unknown as MiniAppRow) : null;
  } catch (e) {
    console.warn('[miniapps] fetchMiniAppBySlug threw:', e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Store stats — get_mini_app_stats RPC
// ---------------------------------------------------------------------------

export interface MiniAppStats {
  /** Total `app_open` events. */
  views: number;
  /** Distinct wallets that used the app. */
  citizens: number;
}

/**
 * Aggregate store stats for the detail page ("Aufrufe" / "Genutzt von").
 * Backed by the security-definer `get_mini_app_stats` function. Null on error.
 */
export async function fetchMiniAppStats(miniAppId: string): Promise<MiniAppStats | null> {
  try {
    // Not in the generated Supabase types yet — cast (repo convention).
    const { data, error } = await (supabase.rpc as any)('get_mini_app_stats', {
      p_mini_app_id: miniAppId,
    });
    if (error) {
      console.warn('[miniapps] fetchMiniAppStats failed:', error.message);
      return null;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return { views: Number(row.views ?? 0), citizens: Number(row.citizens ?? 0) };
  } catch (e) {
    console.warn('[miniapps] fetchMiniAppStats threw:', e);
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
