// The card renderer's Skia side in the app: one shared SkiaApi (D1's RN Skia adapter), the
// curated fonts and the built-in art bundled from @roebel/card-design. Fonts load once per app
// run; a font that fails to load is left out (its layers are skipped, the card still draws).
import { useEffect, useState } from 'react';
import { Image } from 'react-native';
import { Skia } from '@shopify/react-native-skia';
import type { FontId, FontProviderLike, FontSet, SkiaApi } from '@roebel/card-design';
import { createRnSkiaApi, type RnSkiaLike } from '@roebel/card-design/rn-skia';

/* eslint-disable @typescript-eslint/no-require-imports */
const FONT_MODULES: Record<FontId, number> = {
  'mona': require('@roebel/card-design/fonts/MonaSans-Regular.ttf'),
  'mona-bold': require('@roebel/card-design/fonts/MonaSans-Bold.ttf'),
  'mona-condensed': require('@roebel/card-design/fonts/MonaSansSemiCondensed-Bold.ttf'),
  'barlow': require('@roebel/card-design/fonts/BarlowCondensed-SemiBold.ttf'),
  'barlow-black': require('@roebel/card-design/fonts/BarlowCondensed-ExtraBold.ttf'),
  'playfair': require('@roebel/card-design/fonts/PlayfairDisplay-Bold.ttf'),
  'grotesk': require('@roebel/card-design/fonts/SpaceGrotesk-Bold.ttf'),
};

/** BUILTIN_ASSETS ids → the bundled PNGs (packages/card-design/assets/builtin). */
export const BUILTIN_MODULES: Record<string, number> = {
  'builtin:roebel-mark': require('@roebel/card-design/assets/builtin/roebel-mark.png'),
  'builtin:roebel-mark-dark': require('@roebel/card-design/assets/builtin/roebel-mark-dark.png'),
  'builtin:roebel-mark-gold': require('@roebel/card-design/assets/builtin/roebel-mark-gold.png'),
  'builtin:person-laurel': require('@roebel/card-design/assets/builtin/person-laurel.png'),
  'builtin:person-laurel-dark': require('@roebel/card-design/assets/builtin/person-laurel-dark.png'),
  'builtin:person-laurel-gold': require('@roebel/card-design/assets/builtin/person-laurel-gold.png'),
};
/* eslint-enable @typescript-eslint/no-require-imports */

export type CardSkia = { api: SkiaApi; fonts: FontSet };

let api: SkiaApi | null = null;

/** The one SkiaApi of the app (the adapter keeps a cache of compiled shaders). */
export function cardSkiaApi(): SkiaApi {
  if (!api) api = createRnSkiaApi(Skia as unknown as RnSkiaLike);
  return api;
}

/** Local URI of a bundled module (require() id). */
export function moduleUri(mod: number): string {
  return Image.resolveAssetSource(mod).uri;
}

let loading: Promise<CardSkia> | null = null;
let ready: CardSkia | null = null;

async function loadFonts(): Promise<CardSkia> {
  const provider = Skia.TypefaceFontProvider.Make();
  const families = new Set<FontId>();
  await Promise.all(
    (Object.entries(FONT_MODULES) as [FontId, number][]).map(async ([id, mod]) => {
      try {
        const face = Skia.Typeface.MakeFreeTypeFaceFromData(await Skia.Data.fromURI(moduleUri(mod)));
        if (face) {
          provider.registerFont(face, id);
          families.add(id);
        }
      } catch {
        // Leave the font out.
      }
    }),
  );
  return { api: cardSkiaApi(), fonts: { provider: provider as unknown as FontProviderLike, families } };
}

/** Loads (once) the api and fonts. A failed load is retried on the next call. */
export function loadCardSkia(): Promise<CardSkia> {
  if (ready) return Promise.resolve(ready);
  if (!loading) {
    loading = loadFonts().then(
      (s) => { ready = s; return s; },
      (err) => { loading = null; throw err; },
    );
  }
  return loading;
}

/** The api and fonts; null while the fonts are still loading or when loading failed (`failed`). */
export function useCardSkiaState(): { skia: CardSkia | null; failed: boolean } {
  const [skia, setSkia] = useState<CardSkia | null>(ready);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (skia) return;
    let alive = true;
    loadCardSkia().then(
      (s) => { if (alive) setSkia(s); },
      () => { if (alive) setFailed(true); },
    );
    return () => { alive = false; };
  }, [skia]);
  return { skia, failed: !skia && failed };
}

/** The api and fonts, or null while the fonts are still loading. */
export function useCardSkia(): CardSkia | null {
  return useCardSkiaState().skia;
}
