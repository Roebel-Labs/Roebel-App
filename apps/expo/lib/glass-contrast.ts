/**
 * Colour maths for glass surfaces: how readable text stays once a
 * translucent panel sits over an unknown backdrop.
 *
 * The hero carousel draws a blurred copy of the event poster behind the
 * deck, so a card's backdrop can be any colour at all. The tints below are
 * the smallest ones (plus a margin) that keep title and meta text at WCAG
 * AA over the WORST poster pixel — see lib/__tests__/glass-contrast.test.ts,
 * which recomputes the ratios instead of trusting these numbers.
 */
import type { ThemeVariant } from '@/constants/theme';

/** WCAG 2.1 AA for body-sized text. */
export const WCAG_AA_NORMAL_TEXT = 4.5;

export type Rgb = { r: number; g: number; b: number };

function clamp255(value: number): number {
  return Math.min(255, Math.max(0, value));
}

export function parseColor(color: string): { rgb: Rgb; alpha: number } {
  const rgba = color.match(/^rgba?\(([^)]+)\)$/i);
  if (rgba) {
    const parts = rgba[1].split(',').map((p) => Number(p.trim()));
    return {
      rgb: { r: clamp255(parts[0]), g: clamp255(parts[1]), b: clamp255(parts[2]) },
      alpha: parts.length > 3 ? Math.min(1, Math.max(0, parts[3])) : 1,
    };
  }
  const hex = color.replace('#', '');
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  return {
    rgb: {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
    },
    alpha: full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1,
  };
}

export function toHex({ r, g, b }: Rgb): string {
  const part = (v: number) => Math.round(clamp255(v)).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** Source-over compositing, the same blend the renderer does. */
export function compositeOver(foreground: string, background: string): string {
  const fg = parseColor(foreground);
  const bg = parseColor(background);
  return toHex({
    r: fg.rgb.r * fg.alpha + bg.rgb.r * (1 - fg.alpha),
    g: fg.rgb.g * fg.alpha + bg.rgb.g * (1 - fg.alpha),
    b: fg.rgb.b * fg.alpha + bg.rgb.b * (1 - fg.alpha),
  });
}

function channelToLinear(value: number): number {
  const s = value / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(color: string): number {
  const { rgb } = parseColor(color);
  return (
    0.2126 * channelToLinear(rgb.r) +
    0.7152 * channelToLinear(rgb.g) +
    0.0722 * channelToLinear(rgb.b)
  );
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Page background and the poster pixel that hurts most, per theme. */
const AMBIENT_WORST_CASE: Record<ThemeVariant, { background: string; poster: string }> = {
  // Dark text on a light page: a black poster pixel is the dangerous one.
  light: { background: '#ffffff', poster: '#000000' },
  // Light text on a dark page: a white poster pixel is.
  dim: { background: '#18191B', poster: '#ffffff' },
  dark: { background: '#000000', poster: '#ffffff' },
};

/**
 * The colour behind a hero card in the worst case: the loudest poster pixel
 * showing through the ambient wash at `ambientOpacity`.
 */
export function worstCaseAmbientBackdrop(variant: ThemeVariant, ambientOpacity: number): string {
  const { background, poster } = AMBIENT_WORST_CASE[variant];
  const { rgb } = parseColor(poster);
  return compositeOver(`rgba(${rgb.r},${rgb.g},${rgb.b},${ambientOpacity})`, background);
}

/**
 * The frost each hero card lays over that backdrop. Light mode has to go
 * nearly opaque because its grey meta text cannot clear AA otherwise; the
 * dark themes keep a genuine see-through panel.
 */
export const HERO_GLASS_TINT: Record<ThemeVariant, { rgb: string; alpha: number }> = {
  light: { rgb: '255,255,255', alpha: 0.94 },
  dim: { rgb: '12,13,15', alpha: 0.5 },
  dark: { rgb: '0,0,0', alpha: 0.32 },
};

export function heroGlassTintColor(variant: ThemeVariant): string {
  const tint = HERO_GLASS_TINT[variant];
  return `rgba(${tint.rgb},${tint.alpha})`;
}

/** The colour text actually sits on: the tint composited over a backdrop. */
export function heroGlassSurfaceColor(variant: ThemeVariant, backdrop: string): string {
  return compositeOver(heroGlassTintColor(variant), backdrop);
}
