import { useFonts } from 'expo-font';
import { useEffect, useState } from 'react';

/**
 * App font loader.
 *
 * The Röbel app standardised on **Mona Sans** (GitHub, SIL OFL 1.1):
 *   - Body / UI .... Mona Sans                  → theme `fontFamily.regular/medium/semiBold/bold`
 *   - Headlines .... Mona Sans SemiCondensed     → theme `fontFamily.heading` (Bold)
 *   - Mono ......... Mona Sans Mono              → theme `fontFamily.mono`
 *
 * The legacy `Inter-*` and `GeistMono-*` family keys are kept as ALIASES that
 * resolve to the Mona Sans files. This lets the ~2,000 components that still
 * hardcode `fontFamily: 'Inter-Regular'` render Mona Sans with no per-file
 * edits. New code should reference the tokens in `constants/theme.ts`.
 */
export default function useAppFonts() {
  const [loadError, setLoadError] = useState<Error | null>(null);

  const [fontsLoaded, fontError] = useFonts({
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

    // ── Legacy aliases → Mona Sans (back-compat, do not use in new code) ──
    'Inter-Regular': require('@/assets/fonts/Mona-Sans/MonaSans-Regular.ttf'),
    'Inter-Medium': require('@/assets/fonts/Mona-Sans/MonaSans-Medium.ttf'),
    'Inter-SemiBold': require('@/assets/fonts/Mona-Sans/MonaSans-SemiBold.ttf'),
    'Inter-Bold': require('@/assets/fonts/Mona-Sans/MonaSans-Bold.ttf'),
    'GeistMono-Regular': require('@/assets/fonts/Mona-Mono/MonaSansMono-Regular.ttf'),
    'GeistMono-Medium': require('@/assets/fonts/Mona-Mono/MonaSansMono-Medium.ttf'),
  });

  useEffect(() => {
    if (fontError) {
      console.error('Font loading error:', fontError);
      setLoadError(fontError);
    }
  }, [fontError]);

  return { fontsLoaded, fontError: loadError };
}
