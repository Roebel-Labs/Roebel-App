// Bundled fonts (never loaded from the network). Import this module once in every page that renders.
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/plus-jakarta-sans/800.css';

const FAMILIES = ['Inter', 'Plus Jakarta Sans'] as const;
const WEIGHTS = [400, 600, 700, 800] as const;
// Covers the latin + latin-ext subsets German names need.
const SAMPLE = 'AaÄäÖöÜüß€ŁłŠšĆć·–…';

let ready: Promise<void> | null = null;

/**
 * Resolves once every bundled face is loaded. Canvas text does NOT trigger font loading by itself,
 * so await this before the first frame or the first seconds air in the fallback font.
 */
export function loadFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  ready ??= Promise.all(
    FAMILIES.flatMap((f) => WEIGHTS.map((w) => document.fonts.load(`${w} 32px "${f}"`, SAMPLE).catch(() => []))),
  ).then(() => document.fonts.ready.then(() => undefined));
  return ready;
}
