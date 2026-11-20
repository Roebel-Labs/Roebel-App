// The curated, OFL-licensed font set (files in packages/card-design/fonts).
import type { FontId } from './schema';
import type { FontSet, SkiaApi } from './draw/api';

export const FONT_FILES: Record<FontId, string> = {
  'mona': 'MonaSans-Regular.ttf',
  'mona-bold': 'MonaSans-Bold.ttf',
  'mona-condensed': 'MonaSansSemiCondensed-Bold.ttf',
  'barlow': 'BarlowCondensed-SemiBold.ttf',
  'barlow-black': 'BarlowCondensed-ExtraBold.ttf',
  'playfair': 'PlayfairDisplay-Bold.ttf',
  'grotesk': 'SpaceGrotesk-Bold.ttf',
};

/** German display names for the font picker. */
export const FONT_LABELS: Record<FontId, string> = {
  'mona': 'Mona Sans',
  'mona-bold': 'Mona Sans Fett',
  'mona-condensed': 'Mona Sans Schmal',
  'barlow': 'Barlow Condensed',
  'barlow-black': 'Barlow Condensed Extrafett',
  'playfair': 'Playfair Display',
  'grotesk': 'Space Grotesk',
};

/**
 * Loads every curated font through `loader` (file name → bytes). A font that fails
 * to load is left out; layers using it are then skipped at draw time.
 */
export async function loadFontSet(api: SkiaApi, loader: (file: string) => Promise<Uint8Array>): Promise<FontSet> {
  const provider = api.makeFontProvider();
  const families = new Set<FontId>();
  await Promise.all(
    (Object.entries(FONT_FILES) as [FontId, string][]).map(async ([id, file]) => {
      try {
        if (api.registerFont(provider, await loader(file), id)) families.add(id);
      } catch {
        // Missing font: leave it out.
      }
    }),
  );
  return { provider, families };
}
