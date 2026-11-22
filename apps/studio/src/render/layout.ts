import type { Crop, Frame, Scene } from '../state/types';

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

// ---------------------------------------------------------------------------
// Free layout: every layer has its own box (move, resize, snap in the preview).

/** `free`: a layer of a free scene (transparent around a contained picture instead of black bars). */
export type Layer = {
  sourceId: string;
  rect: Rect;
  fit: 'cover' | 'contain' | 'auto';
  radius: number;
  border: boolean;
  free: boolean;
  /** Free layers only: frame line style and the part of the source that is cut away. */
  borderWidth?: number;
  borderColor?: string;
  crop?: Crop;
};

/** Largest share of the picture one edge may cut away (two opposite edges together keep ≥ 10 %). */
export const MAX_CROP = 0.45;

/** A crop with every edge clamped to 0…MAX_CROP; undefined when nothing is cut. */
export function cleanCrop(c: Crop | undefined): Crop | undefined {
  if (!c) return undefined;
  const k = (v: number) => (Number.isFinite(v) ? Math.min(MAX_CROP, Math.max(0, v)) : 0);
  const out = { l: k(c.l), t: k(c.t), r: k(c.r), b: k(c.b) };
  return out.l || out.t || out.r || out.b ? out : undefined;
}

/** The part of a srcW×srcH picture that remains after `crop` (source pixels). */
export function cropRect(srcW: number, srcH: number, crop: Crop | undefined): Rect {
  const c = cleanCrop(crop);
  if (!c) return { x: 0, y: 0, w: srcW, h: srcH };
  return { x: srcW * c.l, y: srcH * c.t, w: srcW * (1 - c.l - c.r), h: srcH * (1 - c.t - c.b) };
}

/**
 * The layers a scene draws, bottom first. `auto` fit = the source kind decides (images and screens contain,
 * cameras and videos cover), as the fixed layouts always did. A split / pip background becomes the bottom full-frame layer.
 */
export function sceneLayers(scene: Scene, W: number, H: number): Layer[] {
  if (scene.layout === 'free') {
    return scene.sourceIds.map((id) => {
      const f = scene.frames?.[id];
      const rect = f ? { x: f.x, y: f.y, w: f.w, h: f.h } : { x: 0, y: 0, w: W, h: H };
      return {
        sourceId: id,
        rect,
        fit: f?.fit ?? 'auto',
        radius: Math.max(0, f?.radius ?? 0),
        border: !!f?.border,
        free: true,
        borderWidth: f?.borderWidth,
        borderColor: f?.borderColor,
        crop: cleanCrop(f?.crop),
      };
    });
  }
  const rects = sceneRects(scene.layout, W, H, { fill: scene.fill });
  const out: Layer[] = [];
  if (scene.layout !== 'full' && scene.backgroundSourceId) {
    out.push({ sourceId: scene.backgroundSourceId, rect: { x: 0, y: 0, w: W, h: H }, fit: 'auto', radius: 0, border: false, free: false });
  }
  rects.forEach((rect, i) => {
    const id = scene.sourceIds[i];
    if (id !== undefined) out.push({ sourceId: id, rect, fit: 'auto', radius: 0, border: scene.layout === 'pip' && i === 1, free: false });
  });
  return out;
}

/** The same picture as a free scene (what the operator sees stays put; from here on every box can move). */
export function toFreeScene(scene: Scene, W: number, H: number): Scene {
  if (scene.layout === 'free') return scene;
  const layers = sceneLayers(scene, W, H);
  const frames: Record<string, Frame> = {};
  const ids: string[] = [];
  for (const l of layers) {
    if (frames[l.sourceId]) continue; // the same source twice (background = foreground): keep the first box
    ids.push(l.sourceId);
    const fit = l.fit === 'auto' ? undefined : l.fit;
    frames[l.sourceId] = { ...round(l.rect), ...(fit ? { fit } : {}), ...(l.border ? { border: true } : {}) };
  }
  // A letterboxed split kept black bars: the halves stay 16:9 boxes. A filled split crops: cover does that.
  const { fill: _f, backgroundSourceId: _b, ...rest } = scene;
  return { ...rest, layout: 'free', sourceIds: ids, frames };
}

const round = (r: Rect): Rect => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) });

/** Box for a layer added to a free scene: bottom-right corner, 30 % size, stacked left of the ones already there. */
export function defaultFrame(W: number, H: number, index: number): Frame {
  const w = Math.round(W * 0.3);
  const h = Math.round(H * 0.3);
  const m = 40;
  const x = Math.max(0, W - m - w - index * (w + m / 2));
  return { x, y: H - m - h, w, h };
}

export const MIN_BOX = 48;
export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/**
 * Resize `start` by dragging `handle` by (dx, dy). Corners keep the box's aspect ratio unless `free`
 * (Shift); edges change one side. Never smaller than MIN_BOX; the opposite edge stays put.
 */
export function resizeRect(start: Rect, handle: Handle, dx: number, dy: number, free: boolean): Rect {
  let { x, y, w, h } = start;
  const left = handle.includes('w');
  const right = handle.includes('e');
  const top = handle.includes('n');
  const bottom = handle.includes('s');
  if (left) w = start.w - dx;
  if (right) w = start.w + dx;
  if (top) h = start.h - dy;
  if (bottom) h = start.h + dy;
  const corner = (left || right) && (top || bottom);
  if (corner && !free && start.w > 0 && start.h > 0) {
    const ratio = start.w / start.h;
    // Follow whichever axis moved more, relative to the box.
    if (Math.abs(w / start.w) >= Math.abs(h / start.h)) h = w / ratio;
    else w = h * ratio;
  }
  if (w < MIN_BOX) {
    if (corner && !free) h = (MIN_BOX * start.h) / start.w;
    w = MIN_BOX;
  }
  if (h < MIN_BOX) {
    if (corner && !free) w = (MIN_BOX * start.w) / start.h;
    h = MIN_BOX;
  }
  if (left) x = start.x + start.w - w;
  if (top) y = start.y + start.h - h;
  return { x, y, w, h };
}

/** Lines a moving box snaps to: frame edges and centre, plus every other box's edges and centre. */
export function snapLines(others: Rect[], W: number, H: number): { xs: number[]; ys: number[] } {
  const xs = [0, W / 2, W];
  const ys = [0, H / 2, H];
  for (const r of others) {
    xs.push(r.x, r.x + r.w / 2, r.x + r.w);
    ys.push(r.y, r.y + r.h / 2, r.y + r.h);
  }
  return { xs, ys };
}

function nearest(values: number[], lines: number[], tol: number): { delta: number; line: number } | null {
  let best: { delta: number; line: number } | null = null;
  for (const v of values) {
    for (const l of lines) {
      const d = l - v;
      if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best.delta))) best = { delta: d, line: l };
    }
  }
  return best;
}

/** Moves `r` onto the nearest snap line (edges or centre) within `tol` px. Returns the guides that matched. */
export function snapMove(r: Rect, lines: { xs: number[]; ys: number[] }, tol: number): { rect: Rect; guideX: number | null; guideY: number | null } {
  const sx = nearest([r.x, r.x + r.w / 2, r.x + r.w], lines.xs, tol);
  const sy = nearest([r.y, r.y + r.h / 2, r.y + r.h], lines.ys, tol);
  return {
    rect: { ...r, x: r.x + (sx?.delta ?? 0), y: r.y + (sy?.delta ?? 0) },
    guideX: sx ? sx.line : null,
    guideY: sy ? sy.line : null,
  };
}

/** Snaps only the edges a resize handle moves (the opposite edges stay where they are). */
export function snapResize(r: Rect, handle: Handle, lines: { xs: number[]; ys: number[] }, tol: number): { rect: Rect; guideX: number | null; guideY: number | null } {
  let { x, y, w, h } = r;
  let guideX: number | null = null;
  let guideY: number | null = null;
  if (handle.includes('e')) {
    const s = nearest([x + w], lines.xs, tol);
    if (s) (w += s.delta), (guideX = s.line);
  } else if (handle.includes('w')) {
    const s = nearest([x], lines.xs, tol);
    if (s) (x += s.delta), (w -= s.delta), (guideX = s.line);
  }
  if (handle.includes('s')) {
    const s = nearest([y + h], lines.ys, tol);
    if (s) (h += s.delta), (guideY = s.line);
  } else if (handle.includes('n')) {
    const s = nearest([y], lines.ys, tol);
    if (s) (y += s.delta), (h -= s.delta), (guideY = s.line);
  }
  return { rect: { x, y, w, h }, guideX, guideY };
}
