import type { Scene } from '../state/types';

export type Rect = { x: number; y: number; w: number; h: number };

const PIP_SCALE = 0.3;
const PIP_MARGIN = 40;

/**
 * Source rectangles for a scene layout, in draw order.
 * full = whole frame; pip = full + bottom-right 30 % inset (40 px margin);
 * split = two 16:9 halves, letterboxed vertically; with `fill` two full-height halves (sources cropped).
 */
export function sceneRects(layout: Scene['layout'], W: number, H: number, opts: { fill?: boolean } = {}): Rect[] {
  const full: Rect = { x: 0, y: 0, w: W, h: H };
  switch (layout) {
    case 'pip': {
      const w = Math.round(W * PIP_SCALE);
      const h = Math.round(H * PIP_SCALE);
      return [full, { w, h, x: W - w - PIP_MARGIN, y: H - h - PIP_MARGIN }];
    }
    case 'split': {
      const w = W / 2;
      if (opts.fill) {
        return [
          { x: 0, y: 0, w, h: H },
          { x: w, y: 0, w, h: H },
        ];
      }
      const h = Math.round((w * H) / W);
      const y = Math.round((H - h) / 2);
      return [
        { x: 0, y, w, h },
        { x: w, y, w, h },
      ];
    }
    default:
      return [full];
  }
}

/** Places a srcW×srcH image inside `box` (contain = letterbox, cover = crop). */
export function fitRect(srcW: number, srcH: number, box: Rect, fit: 'contain' | 'cover'): Rect {
  if (!(srcW > 0) || !(srcH > 0)) return { ...box };
  const s = fit === 'cover' ? Math.max(box.w / srcW, box.h / srcH) : Math.min(box.w / srcW, box.h / srcH);
  const w = srcW * s;
  const h = srcH * s;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}
