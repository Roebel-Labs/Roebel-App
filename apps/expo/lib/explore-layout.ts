/**
 * Personalised Erkunden layout.
 *
 * Erkunden (below the fixed search bar + category chips) is a list of
 * registered blocks. A layout is just data: which blocks, in which order,
 * which are hidden. Three layers resolve into what the screen renders:
 *
 *   1. CODE_DEFAULT_LAYOUT                     — always valid fallback
 *   2. server default (`app_settings.explore_layout`) — admins change the
 *      default for everyone without an app update; may also ship presets
 *   3. the user's own override (device-local, AsyncStorage)
 *
 * Nothing here can render arbitrary UI: every id must be a registered block
 * or a pinned mini app (`miniapp:<slug>`), so neither a bad server value nor
 * a Mecky proposal can break the screen. Locked blocks can be moved but never
 * hidden — reserved for civic surfaces (votes, official notices) that must
 * reach every citizen.
 *
 * Storage follows the lib/miniapp-installs.ts pattern: module-level cache +
 * subscribers, synchronous reads once hydrated.
 */
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { fetchExploreLayoutSetting } from './supabase-app-settings';

// ── Registry ─────────────────────────────────────────────────────────

export type ExploreBlockId =
  | 'hero'
  | 'this_week'
  | 'all_events'
  | 'nearby_events'
  | 'movies'
  | 'audio'
  | 'mini_apps'
  | 'marketplace'
  | 'news'
  | 'restaurants'
  | 'businesses';

export interface ExploreBlockDef {
  id: ExploreBlockId;
  label: string;
  description: string;
  /** Can be reordered but never hidden. */
  locked?: boolean;
}

export const EXPLORE_BLOCKS: readonly ExploreBlockDef[] = [
  { id: 'hero', label: 'Highlights', description: 'Beliebte Veranstaltungen als große Karten' },
  { id: 'this_week', label: 'Diese Woche', description: 'Veranstaltungen der nächsten Tage' },
  { id: 'all_events', label: 'Alle Veranstaltungen', description: 'Alles, was später ansteht' },
  { id: 'nearby_events', label: 'In der Nähe', description: 'Veranstaltungen rund um Röbel' },
  { id: 'movies', label: 'Kinoprogramm', description: 'Kommende Filmvorführungen' },
  { id: 'audio', label: 'Hören', description: 'Geschichten, Hörbücher und Podcasts' },
  { id: 'mini_apps', label: 'Mini-Apps', description: 'Kleine Apps für Röbel' },
  { id: 'marketplace', label: 'Marktplatz', description: 'Anzeigen und Angebote' },
  { id: 'news', label: 'Neuigkeiten', description: 'Nachrichten aus Röbel' },
  { id: 'restaurants', label: 'Gastronomie', description: 'Restaurants, Cafés und Imbisse' },
  { id: 'businesses', label: 'Unternehmen in der Nähe', description: 'Geschäfte und Vereine' },
] as const;

export const EXPLORE_BLOCK_IDS = EXPLORE_BLOCKS.map((b) => b.id) as ExploreBlockId[];
const BLOCK_BY_ID = new Map(EXPLORE_BLOCKS.map((b) => [b.id, b]));

export const MINIAPP_PREFIX = 'miniapp:';
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function miniAppBlockId(slug: string): string {
  return `${MINIAPP_PREFIX}${slug}`;
}

/** Slug of a pinned mini-app block id, or null for registry blocks. */
export function miniAppSlugOf(id: string): string | null {
  if (!id.startsWith(MINIAPP_PREFIX)) return null;
  const slug = id.slice(MINIAPP_PREFIX.length);
  return SLUG_RE.test(slug) ? slug : null;
}

export function getExploreBlock(id: string): ExploreBlockDef | undefined {
  return BLOCK_BY_ID.get(id as ExploreBlockId);
}

function isKnownId(id: unknown): id is string {
  return typeof id === 'string' && (BLOCK_BY_ID.has(id as ExploreBlockId) || miniAppSlugOf(id) !== null);
}

// ── Layout ───────────────────────────────────────────────────────────

export interface ExploreLayout {
  /** Registry ids and pinned `miniapp:<slug>` ids, top to bottom. */
  order: string[];
  /** Registry ids the user does not want to see. */
  hidden: string[];
}

export interface ExplorePreset {
  id: string;
  label: string;
  description: string;
  layout: ExploreLayout;
}

export const CODE_DEFAULT_LAYOUT: ExploreLayout = { order: [...EXPLORE_BLOCK_IDS], hidden: [] };

export const CODE_PRESETS: readonly ExplorePreset[] = [
  {
    id: 'standard',
    label: 'Standard',
    description: 'Alles, in der gewohnten Reihenfolge',
    layout: CODE_DEFAULT_LAYOUT,
  },
  {
    id: 'uebersichtlich',
    label: 'Übersichtlich',
    description: 'Nur das Wichtigste: Highlights, diese Woche, Neuigkeiten, Gastronomie',
    layout: {
      order: ['hero', 'this_week', 'news', 'restaurants'],
      hidden: ['all_events', 'nearby_events', 'movies', 'audio', 'mini_apps', 'marketplace', 'businesses'],
    },
  },
  {
    id: 'veranstaltungen',
    label: 'Veranstaltungen zuerst',
    description: 'Alle Termine oben, dazu Kino und Hören',
    layout: {
      order: ['hero', 'this_week', 'all_events', 'nearby_events', 'movies', 'audio'],
      hidden: ['marketplace', 'businesses'],
    },
  },
  {
    id: 'neu',
    label: 'Neu in Röbel',
    description: 'Erst Orte und Menschen kennenlernen, dann Termine',
    layout: {
      order: ['restaurants', 'businesses', 'news', 'mini_apps', 'this_week', 'hero'],
      hidden: [],
    },
  },
];

/** Drop unknown ids and duplicates; drop hidden flags on locked or non-registry ids. */
export function sanitizeLayout(input: unknown): ExploreLayout | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as { order?: unknown; hidden?: unknown };
  if (!Array.isArray(raw.order)) return null;
  const order = [...new Set(raw.order.filter(isKnownId))];
  const hidden = Array.isArray(raw.hidden)
    ? [...new Set(raw.hidden.filter((id): id is string => {
        const def = typeof id === 'string' ? getExploreBlock(id) : undefined;
        return !!def && !def.locked;
      }))]
    : [];
  return { order, hidden };
}

/**
 * Add every registry block the layout omits.
 * - 'append' (presets, server default — partial on purpose): the listed
 *   blocks stay on top, the rest follow in base order.
 * - 'insert' (a saved user layout — complete when saved): blocks added in a
 *   later release go right after their predecessor in the base order, so they
 *   show up where the base puts them instead of sinking to the bottom.
 */
export function completeLayout(
  layout: ExploreLayout,
  base: ExploreLayout = CODE_DEFAULT_LAYOUT,
  mode: 'append' | 'insert' = 'append',
): ExploreLayout {
  const order = [...layout.order];
  const present = new Set(order);
  const baseOrder = [...base.order, ...EXPLORE_BLOCK_IDS.filter((id) => !base.order.includes(id))];
  baseOrder.forEach((id, i) => {
    if (present.has(id) || miniAppSlugOf(id)) return;
    let at = order.length;
    if (mode === 'insert') {
      at = 0;
      for (let j = i - 1; j >= 0; j--) {
        const k = order.indexOf(baseOrder[j]);
        if (k !== -1) { at = k + 1; break; }
      }
    }
    order.splice(at, 0, id);
    present.add(id);
  });
  return { order, hidden: layout.hidden.filter((id) => !getExploreBlock(id)?.locked) };
}

export function visibleBlockIds(layout: ExploreLayout): string[] {
  const hidden = new Set(layout.hidden);
  return layout.order.filter((id) => !hidden.has(id));
}

/** Apply a preset while keeping the user's pinned mini apps on top. */
export function applyPresetLayout(preset: ExplorePreset, current: ExploreLayout | null, base: ExploreLayout): ExploreLayout {
  const pinned = (current?.order ?? []).filter((id) => miniAppSlugOf(id));
  const done = completeLayout(preset.layout, base);
  return { order: [...pinned, ...done.order.filter((id) => !pinned.includes(id))], hidden: done.hidden };
}

// ── Server config (app_settings.explore_layout) ──────────────────────

export interface ExploreServerConfig {
  base: ExploreLayout;
  presets: ExplorePreset[];
}

/**
 * Value shape: `{ "default": { "order": [...], "hidden": [...] },
 *                 "presets": [{ "id", "label", "description", "order", "hidden" }] }`
 * Anything malformed falls back to the code defaults piece by piece.
 */
// Stable identity: the hook's fallback must not mint a new base each render.
const CODE_CONFIG: ExploreServerConfig = { base: CODE_DEFAULT_LAYOUT, presets: [...CODE_PRESETS] };

export function parseExploreServerConfig(raw: string | null): ExploreServerConfig {
  const fallback = CODE_CONFIG;
  if (!raw) return fallback;
  let json: any;
  try {
    json = JSON.parse(raw);
  } catch {
    return fallback;
  }
  const def = sanitizeLayout(json?.default);
  const base = def ? completeLayout(def) : CODE_DEFAULT_LAYOUT;
  const serverPresets: ExplorePreset[] = Array.isArray(json?.presets)
    ? json.presets.flatMap((p: any) => {
        const layout = sanitizeLayout(p);
        if (!layout || typeof p.id !== 'string' || typeof p.label !== 'string') return [];
        return [{ id: p.id, label: p.label, description: typeof p.description === 'string' ? p.description : '', layout }];
      })
    : [];
  // Server presets replace code presets with the same id, then append.
  const byId = new Map<string, ExplorePreset>(CODE_PRESETS.map((p) => [p.id, p]));
  serverPresets.forEach((p) => byId.set(p.id, p));
  // "Standard" always means the current default for everyone.
  byId.set('standard', { ...byId.get('standard')!, layout: base });
  return { base, presets: [...byId.values()] };
}

async function fetchExploreServerConfig(): Promise<ExploreServerConfig> {
  return parseExploreServerConfig(await fetchExploreLayoutSetting());
}

export const EXPLORE_LAYOUT_CONFIG_QUERY_KEY = ['explore', 'layout-config'] as const;

// ── User override store ──────────────────────────────────────────────

const STORAGE_KEY = 'explore.layout.v1';

export interface StoredExploreLayout extends ExploreLayout {
  /** Set while the layout equals a preset; cleared by any manual edit. */
  presetId: string | null;
}

let cache: StoredExploreLayout | null = null;
let hydrated = false;
let loadPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((l) => l());
}

function load(): Promise<void> {
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        const layout = sanitizeLayout(parsed);
        cache = layout ? { ...layout, presetId: typeof parsed.presetId === 'string' ? parsed.presetId : null } : null;
      } catch {
        cache = null;
      }
      hydrated = true;
      notify();
    })();
  }
  return loadPromise;
}

async function persist(next: StoredExploreLayout | null): Promise<void> {
  cache = next;
  notify();
  try {
    if (next) await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Device-local convenience: a failed write keeps the in-memory layout for this session.
  }
}

/** The saved override (null = follow the default). Hydrates on first call. */
export async function getStoredExploreLayout(): Promise<StoredExploreLayout | null> {
  await load();
  return cache;
}

export async function saveExploreLayout(layout: ExploreLayout, presetId: string | null = null): Promise<void> {
  await load();
  const clean = sanitizeLayout(layout);
  if (clean) await persist({ ...clean, presetId });
}

export async function resetExploreLayout(): Promise<void> {
  await load();
  await persist(null);
}

// ── Hook ─────────────────────────────────────────────────────────────

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  void load();
  return () => {
    listeners.delete(listener);
  };
}

// Snapshot via useSyncExternalStore, not a module read during render: the
// React Compiler may memoise a plain global read and miss later writes.
const getSnapshot = () => cache;
const getHydrated = () => hydrated;

export function useExploreLayout() {
  const stored = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const ready = useSyncExternalStore(subscribe, getHydrated, getHydrated);

  const configQuery = useQuery({
    queryKey: EXPLORE_LAYOUT_CONFIG_QUERY_KEY,
    queryFn: fetchExploreServerConfig,
    meta: { persist: true },
    staleTime: 10 * 60 * 1000,
  });
  const config = configQuery.data ?? CODE_CONFIG;

  const layout = useMemo(
    () => (stored ? completeLayout(stored, config.base, 'insert') : config.base),
    [stored, config.base],
  );

  const save = useCallback((next: ExploreLayout) => saveExploreLayout(next, null), []);
  const applyPreset = useCallback(
    (preset: ExplorePreset) =>
      preset.id === 'standard'
        ? // Keep pins; otherwise follow the (server) default.
          (cache?.order ?? []).some((id) => miniAppSlugOf(id))
          ? saveExploreLayout(applyPresetLayout(preset, cache, config.base), 'standard')
          : resetExploreLayout()
        : saveExploreLayout(applyPresetLayout(preset, cache, config.base), preset.id),
    [config.base],
  );

  return {
    /** False until the device override is read; render the default meanwhile. */
    ready,
    layout,
    base: config.base,
    presets: config.presets,
    /** Preset currently in effect; 'standard' when there is no override. */
    presetId: stored ? stored.presetId : 'standard',
    isCustom: !!stored,
    save,
    applyPreset,
    reset: resetExploreLayout,
  };
}
