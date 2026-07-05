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
