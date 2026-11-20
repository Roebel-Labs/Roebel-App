// Checks shown as hints, never blocks: text that is hard to read, images that will look blurry, and
// parts outside the card.
import { LOGO_SLOT_ASSET, PRESETS, designSize, mixHex, parseHex, tintedStops, type CardDesign, type Layer } from '@roebel/card-design';
import { isOutside } from './geometry';

export type HintKind = 'contrast' | 'blurry' | 'outside';
export interface Hint {
  layerId: string;
  kind: HintKind;
}

const lum = (hex: string) => {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG contrast ratio of two #rrggbb colours (alpha ignored). */
export function contrastRatio(a: string, b: string): number {
  const la = lum(a.slice(0, 7)), lb = lum(b.slice(0, 7));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Background colour under the point (x, y): the preset's base gradient there; null for an image. */
export function backgroundAt(d: CardDesign, x: number, y: number): string | null {
  const bg = d.background;
  if (bg.kind !== 'preset') return null;
  const p = PRESETS[bg.preset];
  const stops = p.tintable && bg.color ? tintedStops(bg.color.slice(0, 7), p.stops.length) : p.stops;
  const { w: W, h: H } = designSize(d.format);
  const [fx, fy] = [p.from[0] * W, p.from[1] * H], [tx, ty] = [p.to[0] * W, p.to[1] * H];
  const len2 = (tx - fx) ** 2 + (ty - fy) ** 2 || 1;
  const t = Math.max(0, Math.min(1, ((x - fx) * (tx - fx) + (y - fy) * (ty - fy)) / len2));
  for (let i = 1; i < stops.length; i++) {
    const a = p.positions[i - 1], b = p.positions[i];
    if (t <= b) return mixHex(stops[i - 1].slice(0, 7), stops[i].slice(0, 7), b > a ? (t - a) / (b - a) : 0);
  }
  return stops[stops.length - 1].slice(0, 7);
}

export function layerHints(d: CardDesign, l: Layer, sizes: Map<string, { w: number; h: number }>): HintKind[] {
  const out: HintKind[] = [];
  if (l.type !== 'image' && l.opacity > 0) {
    const under = backgroundAt(d, l.x + l.w / 2, l.y + l.h / 2);
    if (under && contrastRatio(l.color, under) < 3) out.push('contrast');
  }
  if (l.type === 'image' && l.assetId !== LOGO_SLOT_ASSET) {
    const s = sizes.get(l.assetId);
    if (s && s.w > 0 && s.h > 0) {
      const fit = Math.min(l.w / s.w, l.h / s.h);
      // The image should have at least twice as many pixels as the box it fills.
      if (s.w < 2 * s.w * fit) out.push('blurry');
    }
  }
  if (isOutside(d, l)) out.push('outside');
  return out;
}

export function designHints(d: CardDesign, sizes: Map<string, { w: number; h: number }>): Hint[] {
  return d.layers.flatMap((l) => layerHints(d, l, sizes).map((kind) => ({ layerId: l.id, kind })));
}
