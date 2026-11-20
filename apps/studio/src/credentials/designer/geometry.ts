// Drag maths of the editor in card units: move with snapping, resize from a handle (also on rotated
// layers), rotate around the centre.
import { designSize, snap, type CardDesign, type Layer, type LayerPatch } from '@roebel/card-design';

export type Handle = 'nw' | 'ne' | 'sw' | 'se' | 'e' | 'w';
export const MIN_SIDE = 12;
const SNAP_TOLERANCE = 6;

const rad = (deg: number) => (deg * Math.PI) / 180;
const rot = (x: number, y: number, deg: number): [number, number] => {
  const c = Math.cos(rad(deg)), s = Math.sin(rad(deg));
  return [x * c - y * s, x * s + y * c];
};

/** The four corners of a layer's (rotated) box. */
export function corners(l: Pick<Layer, 'x' | 'y' | 'w' | 'h' | 'rotation'>): [number, number][] {
  const cx = l.x + l.w / 2, cy = l.y + l.h / 2;
  return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([sx, sy]) => {
    const [dx, dy] = rot((sx * l.w) / 2, (sy * l.h) / 2, l.rotation);
    return [cx + dx, cy + dy];
  });
}

export interface Guides {
  v: number[];
  h: number[];
}

/** Snap targets per axis: card edges and centre lines, and the edges and centres of other layers. */
function targets(d: CardDesign, skip: string): { v: number[]; h: number[] } {
  const { w: W, h: H } = designSize(d.format);
  const v = [0, W / 2, W], h = [0, H / 2, H];
  for (const l of d.layers) {
    if (l.id === skip || l.rotation !== 0) continue;
    v.push(l.x, l.x + l.w / 2, l.x + l.w);
    h.push(l.y, l.y + l.h / 2, l.y + l.h);
  }
  return { v, h };
}

function snapAxis(edges: number[], t: number[], tolerance: number): { delta: number; at: number | null } {
  let best = { delta: 0, at: null as number | null };
  for (const e of edges) {
    const s = snap(e, t, tolerance);
    if (s !== e && (best.at === null || Math.abs(s - e) < Math.abs(best.delta))) best = { delta: s - e, at: s };
  }
  return best;
}

/** New position of `start` moved by (dx, dy), snapped unless `free` (Alt held). */
export function moveLayerTo(d: CardDesign, start: Layer, dx: number, dy: number, free = false): { x: number; y: number; guides: Guides } {
  const { w: W } = designSize(d.format);
  let x = start.x + dx, y = start.y + dy;
  const guides: Guides = { v: [], h: [] };
  if (!free && start.rotation === 0) {
    const t = targets(d, start.id);
    const sx = snapAxis([x, x + start.w / 2, x + start.w], t.v, SNAP_TOLERANCE);
    const sy = snapAxis([y, y + start.h / 2, y + start.h], t.h, SNAP_TOLERANCE);
    x += sx.delta;
    y += sy.delta;
    if (sx.at !== null) guides.v.push(sx.at);
    if (sy.at !== null) guides.h.push(sy.at);
  }
  const clamp = (v: number) => Math.max(-W + 1, Math.min(2 * W - 1, v));
  return { x: round(clamp(x)), y: round(clamp(y)), guides };
}

const round = (v: number) => Math.round(v * 10) / 10;

/**
 * Resize from a handle by the pointer delta (dx, dy, card units). Corners scale uniformly (text grows
 * with its box); the side handles change the width only (text wraps). The opposite side stays put.
 */
export function resizeLayer(start: Layer, handle: Handle, dx: number, dy: number): LayerPatch {
  const [lx, ly] = rot(dx, dy, -start.rotation);
  const sx = handle === 'e' || handle === 'ne' || handle === 'se' ? 1 : -1;
  const sy = handle === 'sw' || handle === 'se' ? 1 : handle === 'nw' || handle === 'ne' ? -1 : 0;
  let w: number, h: number, scale = 1;
  if (handle === 'e' || handle === 'w') {
    w = Math.max(MIN_SIDE, start.w + sx * lx);
    h = start.h;
  } else {
    const s = 1 + (sx * lx * start.w + sy * ly * start.h) / (start.w * start.w + start.h * start.h);
    scale = Math.max(MIN_SIDE / Math.min(start.w, start.h), s);
    w = start.w * scale;
    h = start.h * scale;
  }
  const [ox, oy] = rot((sx * (w - start.w)) / 2, (sy * (h - start.h)) / 2, start.rotation);
  const cx = start.x + start.w / 2 + ox, cy = start.y + start.h / 2 + oy;
  const patch: LayerPatch = { x: round(cx - w / 2), y: round(cy - h / 2), w: round(w), h: round(h) };
  if (start.type !== 'image' && scale !== 1) (patch as { size?: number }).size = Math.max(6, Math.min(200, round(start.size * scale)));
  return patch;
}

/** Normalised to (-180, 180]. */
export function normaliseAngle(deg: number): number {
  let a = deg % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  return Math.round(a * 10) / 10;
}

/** Rotation after turning the knob from (x0, y0) to (x, y); snaps to 15° steps (always with `step`). */
export function rotateLayer(start: Layer, x0: number, y0: number, x: number, y: number, step = false): number {
  const cx = start.x + start.w / 2, cy = start.y + start.h / 2;
  const turn = ((Math.atan2(y - cy, x - cx) - Math.atan2(y0 - cy, x0 - cx)) * 180) / Math.PI;
  let r = start.rotation + turn;
  const nearest = Math.round(r / 15) * 15;
  if (step || Math.abs(r - nearest) < 3) r = nearest;
  return normaliseAngle(r);
}

/** Whether any part of the layer lies outside the card. */
export function isOutside(d: CardDesign, l: Layer): boolean {
  const { w: W, h: H } = designSize(d.format);
  return corners(l).some(([x, y]) => x < -1 || y < -1 || x > W + 1 || y > H + 1);
}
