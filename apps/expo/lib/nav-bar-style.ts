/**
 * Bottom-navigation style — Profil → Darstellung → "Navigationsleiste".
 *
 *   standard  the full-width bar every screen has always had
 *   glass     a floating glass pill inset from the screen edges
 *
 * Device-local (AsyncStorage), like the rest of Darstellung. Module-level
 * cache + subscribers (lib/miniapp-installs.ts pattern) so every mounted
 * BottomNavigation flips the moment the setting changes. Hydration starts at
 * import time, which is well before the first screen paints (ThemeProvider
 * holds rendering for its own AsyncStorage read), so the bar does not flash
 * from standard to glass on a cold start.
 */
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type NavBarStyle = 'standard' | 'glass';

export const NAV_BAR_STYLE_KEY = 'settings.navBarStyle.v1';
export const DEFAULT_NAV_BAR_STYLE: NavBarStyle = 'standard';

export const NAV_BAR_STYLE_OPTIONS: readonly { value: NavBarStyle; label: string; description: string }[] = [
  { value: 'standard', label: 'Standard', description: 'Die Leiste über die ganze Breite' },
  { value: 'glass', label: 'Glas', description: 'Schwebende Glasleiste mit Abstand zum Rand' },
];

/** Pure: anything that is not a known style falls back to the default. */
export function parseNavBarStyle(raw: unknown): NavBarStyle {
  return raw === 'glass' || raw === 'standard' ? raw : DEFAULT_NAV_BAR_STYLE;
}

let current: NavBarStyle = DEFAULT_NAV_BAR_STYLE;
let loadPromise: Promise<NavBarStyle> | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((l) => l());
}

export function loadNavBarStyle(): Promise<NavBarStyle> {
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const next = parseNavBarStyle(await AsyncStorage.getItem(NAV_BAR_STYLE_KEY));
        if (next !== current) {
          current = next;
          notify();
        }
      } catch {
        // Keep the default; the setting is cosmetic.
      }
      return current;
    })();
  }
  return loadPromise;
}

export function getNavBarStyle(): NavBarStyle {
  return current;
}

export async function setNavBarStyle(style: NavBarStyle): Promise<void> {
  // Apply first so the switch is instant; persistence is best-effort.
  if (style !== current) {
    current = style;
    notify();
  }
  try {
    await AsyncStorage.setItem(NAV_BAR_STYLE_KEY, style);
  } catch {
    // Stays applied for this session.
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useNavBarStyle(): NavBarStyle {
  return useSyncExternalStore(subscribe, getNavBarStyle, getNavBarStyle);
}

/** Test-only: forget the hydrated value. */
export function __resetNavBarStyleForTests(): void {
  current = DEFAULT_NAV_BAR_STYLE;
  loadPromise = null;
  listeners.clear();
}

void loadNavBarStyle();
