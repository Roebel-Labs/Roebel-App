/**
 * Installed-state registry for mini apps.
 *
 * "Installed" is a device-local concept: the first time the user opens an
 * app's host, its slug is persisted here. Installed apps skip the store
 * preview page — their buttons say "Öffnen" and launch the MiniAppHost
 * directly (World-App-style Get→Open behavior).
 *
 * AsyncStorage-backed with a module-level cache + subscriber model (same
 * pattern as lib/user-cache.ts): reads are synchronous once hydrated, every
 * mutation notifies mounted `useInstalledMiniApps()` hooks.
 */
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'miniapps.installed.v1';

let cache: Set<string> | null = null;
let loadPromise: Promise<Set<string>> | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((l) => l());
}

async function load(): Promise<Set<string>> {
  if (cache) return cache;
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const arr = raw ? (JSON.parse(raw) as unknown) : [];
        cache = new Set(Array.isArray(arr) ? (arr as string[]) : []);
      } catch {
        cache = new Set();
      }
      notify();
      return cache;
    })();
  }
  return loadPromise;
}

/** All installed slugs, hydrating from storage first (used by the home-screen widget). */
export async function getInstalledMiniAppSlugs(): Promise<string[]> {
  return [...(await load())];
}

/** Synchronous check against the hydrated cache (false until hydrated). */
export function isMiniAppInstalled(slug: string): boolean {
  return cache?.has(slug) ?? false;
}

/**
 * Mark a slug installed. Resolves `true` when it was newly installed (callers
 * use this to fire the one-time `install` telemetry event).
 */
export async function markMiniAppInstalled(slug: string): Promise<boolean> {
  const set = await load();
  if (set.has(slug)) return false;
  set.add(slug);
  notify();
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    // Cache still holds it for this session; persistence is best-effort.
  }
  return true;
}

// ── Recently opened (home-screen widget order) ───────────────────────────

const RECENT_KEY = 'miniapps.recent.v1';
/** Twice the largest widget (15 apps) so a delisted app does not push a live one out. */
const RECENT_MAX = 30;

/** Pure: `slug` moves to the front, duplicates dropped, capped. */
export function pushRecent(list: string[], slug: string, max = RECENT_MAX): string[] {
  return [slug, ...list.filter((s) => s !== slug)].slice(0, max);
}

/** Every open of a mini app moves it to the front of the widget's list. */
export async function markMiniAppOpened(slug: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    const list = Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : [];
    await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(pushRecent(list, slug)));
  } catch {
    // Best-effort; the widget falls back to the installed order.
  }
}

/**
 * Most recently opened first. Apps opened before this list existed (older app
 * versions) follow, newest install first.
 */
export async function getRecentMiniAppSlugs(): Promise<string[]> {
  let recent: string[] = [];
  try {
    const raw = await AsyncStorage.getItem(RECENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    recent = Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    recent = [];
  }
  const installed = [...(await load())].reverse();
  return [...recent, ...installed.filter((s) => !recent.includes(s))];
}

/**
 * Hook: re-renders when the installed set changes and exposes a synchronous
 * `isInstalled`. Kick off hydration on first mount.
 */
export function useInstalledMiniApps(): {
  isInstalled: (slug: string) => boolean;
} {
  const [, setVersion] = useState(0);

  useEffect(() => {
    const listener = () => setVersion((v) => v + 1);
    listeners.add(listener);
    void load();
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const isInstalled = useCallback((slug: string) => isMiniAppInstalled(slug), []);
  return { isInstalled };
}
