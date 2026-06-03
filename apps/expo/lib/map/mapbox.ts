/**
 * Single source of truth for Mapbox SDK loading + token init.
 *
 * Importing this module anywhere (EmbeddedMap, the full map screen, etc.)
 * guarantees `setAccessToken` runs exactly once, process-wide — so embedded
 * mini-maps work no matter which screen is opened first. Previously the token
 * was only set in app/location.tsx at module scope, which meant maps rendered
 * blank/gray when a detail screen (e.g. /transit/line/12) was opened directly
 * from search without ever loading the big map.
 */
import Constants from 'expo-constants';

let Mapbox: any = null;
let isMapboxAvailable = false;
try {
  Mapbox = require('@rnmapbox/maps').default;
  isMapboxAvailable = true;
} catch {
  // Native module not available (e.g. Expo Go) — consumers render a placeholder.
}

const mapboxToken =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ||
  process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ||
  '';

// Only initialize Mapbox if we actually have a token — passing '' has caused
// crashes on iPad iPadOS 26.5 during App Review.
if (isMapboxAvailable && Mapbox && mapboxToken) {
  Mapbox.setAccessToken(mapboxToken);
  // Never let Mapbox phone home with usage analytics we haven't disclosed.
  try {
    (Mapbox as { setTelemetryEnabled?: (enabled: boolean) => void }).setTelemetryEnabled?.(false);
  } catch {
    // ignore on platforms that don't expose it
  }
}

export { Mapbox, isMapboxAvailable, mapboxToken };
