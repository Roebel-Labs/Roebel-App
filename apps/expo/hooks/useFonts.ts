import { isLoaded, useFonts } from 'expo-font';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * App font loader.
 *
 * The Röbel app standardised on **Mona Sans** (GitHub, SIL OFL 1.1):
 *   - Body / UI .... Mona Sans                  → theme `fontFamily.regular/medium/semiBold/bold`
 *   - Headlines .... Mona Sans SemiCondensed     → theme `fontFamily.heading` (Bold)
 *   - Mono ......... Mona Sans Mono              → theme `fontFamily.mono`
 *
 * Native (3.10.0+ binaries): the fonts are embedded at build time by the
 * `expo-font` config plugin in app.config.ts, so they are available before
 * the first frame and nothing waits for them — the native splash can hide
 * immediately. The file name equals the PostScript name for every file, so
 * `fontFamily: 'MonaSans-Regular'` resolves on both iOS (PostScript name) and
 * Android (asset file name).
 *
 * Web, and any binary built before the embedding (e.g. the 3.10.0 preview APK,
 * versionCode 42), still load the files at runtime: `FONTS_EMBEDDED` is false
 * there and the same map is passed to `useFonts`.
 *
 * The legacy `Inter-*` / `GeistMono-*` aliases are gone — embedded fonts
 * cannot be aliased. Use the Mona Sans names (or the theme tokens) directly.
 */
const FONT_MAP = {
  // ── Mona Sans (body / UI) ──────────────────────────────
  'MonaSans-Regular': require('@/assets/fonts/Mona-Sans/MonaSans-Regular.ttf'),
  'MonaSans-Medium': require('@/assets/fonts/Mona-Sans/MonaSans-Medium.ttf'),
  'MonaSans-SemiBold': require('@/assets/fonts/Mona-Sans/MonaSans-SemiBold.ttf'),
  'MonaSans-Bold': require('@/assets/fonts/Mona-Sans/MonaSans-Bold.ttf'),

  // ── Mona Sans SemiCondensed (headlines) ────────────────
  'MonaSansSemiCondensed-Regular': require('@/assets/fonts/Mona-SemiCondensed/MonaSansSemiCondensed-Regular.ttf'),
  'MonaSansSemiCondensed-Medium': require('@/assets/fonts/Mona-SemiCondensed/MonaSansSemiCondensed-Medium.ttf'),
  'MonaSansSemiCondensed-SemiBold': require('@/assets/fonts/Mona-SemiCondensed/MonaSansSemiCondensed-SemiBold.ttf'),
  'MonaSansSemiCondensed-Bold': require('@/assets/fonts/Mona-SemiCondensed/MonaSansSemiCondensed-Bold.ttf'),

  // ── Mona Sans Mono (code / addresses / numbers) ────────
  'MonaSansMono-Regular': require('@/assets/fonts/Mona-Mono/MonaSansMono-Regular.ttf'),
  'MonaSansMono-Medium': require('@/assets/fonts/Mona-Mono/MonaSansMono-Medium.ttf'),
  'MonaSansMono-SemiBold': require('@/assets/fonts/Mona-Mono/MonaSansMono-SemiBold.ttf'),
  'MonaSansMono-Bold': require('@/assets/fonts/Mona-Mono/MonaSansMono-Bold.ttf'),
};

// Checked once per process: either the binary embeds the fonts or it does not.
const FONTS_EMBEDDED = (() => {
  if (Platform.OS === 'web') return false;
  try {
    return Object.keys(FONT_MAP).every((family) => isLoaded(family));
  } catch {
    return false;
  }
})();

export default function useAppFonts() {
  const [loadError, setLoadError] = useState<Error | null>(null);

  // An empty map counts as loaded on the first render — no async work.
  const [fontsLoaded, fontError] = useFonts(FONTS_EMBEDDED ? {} : FONT_MAP);

  useEffect(() => {
    if (fontError) {
      console.error('Font loading error:', fontError);
      setLoadError(fontError);
    }
  }, [fontError]);

  return { fontsLoaded: FONTS_EMBEDDED || fontsLoaded, fontError: loadError };
}
