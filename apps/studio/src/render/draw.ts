import type {
  MediaLookup,
  OverlayAnim,
  OverlayInstance,
  RenderContext,
  Scene,
  ShowState,
  Source,
  Template,
  TemplateNode,
  TransitionPreset,
} from '../state/types';
import { ease, overlayProgress, transitionProgress } from './anim';
import { resolveBindings } from './bindings';
import { fitRect, sceneRects, type Rect } from './layout';

// Canvas renderer shared by the preview monitor, the 1920×1080 program canvas and the OBS overlay page.
// Everything is drawn in 1920×1080 space; `opts.scale` maps that onto smaller canvases.

export const FRAME_W = 1920;
export const FRAME_H = 1080;

export type RenderOptions = { overlaysOnly?: boolean; scale?: number };

const SLATE_BG = '#111418';
const SLATE_TEXT = '#E5E7EB';
const SLATE_LABEL = '#9CA3AF';
const FONT_FALLBACK = 'system-ui, -apple-system, Helvetica, Arial, sans-serif';
/** Overlay slide distance in px (1920 space): short and calm, combined with a fade. */
const SLIDE_PX = 80;
/** Overlay scale animation starts at this size. */
const SCALE_FROM = 0.9;
/** Text may shrink to this share of its size before it gets an ellipsis. */
const MIN_TEXT_SCALE = 0.7;
const IMAGE_RETRY_MS = 30_000;

const clamp01 = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t);

// Each distinct error is warned once (a broken template would otherwise log every frame for hours).
const seenErrors = new Set<string>();
const SEEN_ERRORS_MAX = 50;
function report(where: string, e: unknown) {
  const msg = `${where}: ${e instanceof Error ? e.message : String(e)}`;
  if (seenErrors.has(msg)) return;
  if (seenErrors.size >= SEEN_ERRORS_MAX) seenErrors.delete(seenErrors.values().next().value as string);
  seenErrors.add(msg);
  console.warn('[render]', msg);
}

/** Runs `fn` between save/restore; a throw is logged (deduplicated) and never escapes. */
function guarded(ctx: CanvasRenderingContext2D, where: string, fn: () => void) {
  ctx.save();
  try {
    fn();
  } catch (e) {
    report(where, e);
  } finally {
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Entry point

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  state: ShowState,
  media: MediaLookup,
  rc: RenderContext,
  nowMs: number,
  opts: RenderOptions = {},
): void {
  const scale = opts.scale && opts.scale > 0 ? opts.scale : 1;
  try {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (opts.overlaysOnly) {
      ctx.clearRect(0, 0, FRAME_W, FRAME_H);
    } else {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, FRAME_W, FRAME_H);
      guarded(ctx, 'program', () => drawProgram(ctx, state, media, nowMs));
    }
    drawOverlays(ctx, state, rc, nowMs);
  } catch (e) {
    report('frame', e);
  }
}

// ---------------------------------------------------------------------------
// Program scene + transitions

function drawProgram(ctx: CanvasRenderingContext2D, state: ShowState, media: MediaLookup, nowMs: number) {
  const sceneOf = (id: string | null) => (id === null ? undefined : state.scenes.find((s) => s.id === id));
  const to = sceneOf(state.programSceneId);
  const from = sceneOf(state.transition.fromSceneId);
  const preset = state.presets.find((p) => p.id === state.transition.presetId);
  const p = preset ? transitionProgress(state.transition.startedAt, preset.durationMs, nowMs) : 1;
  if (!preset || preset.kind === 'cut' || !from || p >= 1) {
    drawScene(ctx, state, to, media);
    return;
  }
  drawTransition(ctx, state, from, to, preset, ease(preset.easing, p), media);
}

function drawTransition(
  ctx: CanvasRenderingContext2D,
  state: ShowState,
  from: Scene,
  to: Scene | undefined,
  preset: TransitionPreset,
  e: number,
  media: MediaLookup,
) {
  const W = FRAME_W;
  const H = FRAME_H;
  const dir = preset.direction ?? 'left';
  switch (preset.kind) {
    case 'fade':
      drawScene(ctx, state, from, media);
      guarded(ctx, 'fade', () => {
        ctx.globalAlpha = clamp01(e);
        drawScene(ctx, state, to, media);
      });
      return;
    case 'wipe': {
      // `direction` = where the new scene comes FROM (same as slide): 'left' reveals left→right.
      drawScene(ctx, state, from, media);
      const k = clamp01(e);
      const clip: Rect =
        dir === 'left'
          ? { x: 0, y: 0, w: W * k, h: H }
          : dir === 'right'
            ? { x: W * (1 - k), y: 0, w: W * k, h: H }
            : dir === 'up'
              ? { x: 0, y: 0, w: W, h: H * k }
              : { x: 0, y: H * (1 - k), w: W, h: H * k };
      guarded(ctx, 'wipe', () => {
        ctx.beginPath();
        ctx.rect(clip.x, clip.y, clip.w, clip.h);
        ctx.clip();
        drawScene(ctx, state, to, media);
      });
      return;
    }
    case 'slide': {
      // `direction` = where the new scene comes FROM: 'left' enters from the left edge and pushes the old one right.
      const sx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
      const sy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
      guarded(ctx, 'slide-from', () => {
        ctx.translate(-sx * W * e, -sy * H * e);
        drawScene(ctx, state, from, media);
      });
      guarded(ctx, 'slide-to', () => {
        ctx.translate(sx * W * (1 - e), sy * H * (1 - e));
        drawScene(ctx, state, to, media);
      });
      return;
    }
    case 'zoom': {
      drawScene(ctx, state, from, media);
      guarded(ctx, 'zoom', () => {
        const s = 1.1 - 0.1 * e;
        ctx.globalAlpha = clamp01(e);
        ctx.translate(W / 2, H / 2);
        ctx.scale(s, s);
        ctx.translate(-W / 2, -H / 2);
        drawScene(ctx, state, to, media);
      });
      return;
    }
    default:
      drawScene(ctx, state, to, media);
  }
}

function drawScene(ctx: CanvasRenderingContext2D, state: ShowState, scene: Scene | undefined, media: MediaLookup) {
  if (!scene) return;
  const rects = sceneRects(scene.layout, FRAME_W, FRAME_H);
  if (scene.layout !== 'full') {
    // Base fill so letterbox bars / pip backgrounds are black even inside a fading transition.
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, FRAME_W, FRAME_H);
  }
  rects.forEach((r, i) => {
    const id = scene.sourceIds[i];
    if (id === undefined) return;
    const source = state.sources.find((s) => s.id === id);
    guarded(ctx, 'source', () => drawSource(ctx, source, r, media));
    if (scene.layout === 'pip' && i === 1) drawInsetFrame(ctx, r);
  });
}

function drawInsetFrame(ctx: CanvasRenderingContext2D, r: Rect) {
  const b = 3;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillRect(r.x - b, r.y - b, r.w + 2 * b, b);
  ctx.fillRect(r.x - b, r.y + r.h, r.w + 2 * b, b);
  ctx.fillRect(r.x - b, r.y, b, r.h);
  ctx.fillRect(r.x + r.w, r.y, b, r.h);
  ctx.restore();
}

/** Intrinsic size of any CanvasImageSource (video, image, canvas, bitmap, frame). */
function sizeOf(el: CanvasImageSource): { w: number; h: number } {
  const o = el as unknown as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  if ('videoWidth' in o) return { w: n(o.videoWidth), h: n(o.videoHeight) };
  if ('naturalWidth' in o) return { w: n(o.naturalWidth), h: n(o.naturalHeight) };
  if ('displayWidth' in o) return { w: n(o.displayWidth), h: n(o.displayHeight) };
  const w = o.width;
  const h = o.height;
  // SVGImageElement exposes animated lengths; treat as unknown size.
  return { w: n(w), h: n(h) };
}

function drawSource(ctx: CanvasRenderingContext2D, source: Source | undefined, r: Rect, media: MediaLookup) {
  if (!source) {
    drawSlate(ctx, r, 'Signal verloren', '');
    return;
  }
  if (source.kind === 'color') {
    ctx.fillStyle = source.color || '#000000';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    return;
  }
  let m: ReturnType<MediaLookup>;
  try {
    m = media(source.id);
  } catch {
    m = { el: null, status: 'lost' };
  }
  if (m.status === 'lost') return drawSlate(ctx, r, 'Signal verloren', source.label);
  if (m.status !== 'ok' || !m.el) return drawSlate(ctx, r, 'Lädt…', source.label);
  const { w, h } = sizeOf(m.el);
  if (!(w > 0) || !(h > 0)) return drawSlate(ctx, r, 'Lädt…', source.label);
  const fit = source.kind === 'image' ? 'contain' : 'cover';
  const dst = fitRect(w, h, r, fit);
  ctx.fillStyle = '#000000';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.save();
  try {
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    ctx.drawImage(m.el, dst.x, dst.y, dst.w, dst.h);
  } finally {
    ctx.restore();
  }
}

function drawSlate(ctx: CanvasRenderingContext2D, r: Rect, message: string, label: string) {
  ctx.fillStyle = SLATE_BG;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  const size = Math.max(14, Math.min(54, Math.round(r.h * 0.05)));
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = SLATE_TEXT;
  ctx.font = fontString('Inter', 600, size);
  ctx.fillText(message, cx, cy, r.w * 0.9);
  if (label) {
    const small = Math.max(10, Math.round(size * 0.55));
    ctx.fillStyle = SLATE_LABEL;
    ctx.font = fontString('Inter', 400, small);
    ctx.fillText(label, cx, cy + size * 0.6 + small, r.w * 0.9);
  }
}

// ---------------------------------------------------------------------------
// Overlays

type Bounds = Rect;

function boundsOf(nodes: TemplateNode[]): Bounds {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const n of nodes) {
    x0 = Math.min(x0, n.x);
    y0 = Math.min(y0, n.y);
    x1 = Math.max(x1, n.x + n.w);
    y1 = Math.max(y1, n.y + n.h);
  }
  return Number.isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : { x: 0, y: 0, w: 0, h: 0 };
}

/** Per-node delay: the node's own `delayMs` on the way in, plus `staggerMs × index` either way. */
function nodeDelay(n: TemplateNode, i: number, anim: OverlayAnim, visible: boolean): number {
  const stagger = (anim.staggerMs ?? 0) * i;
  return visible ? (n.delayMs ?? 0) + stagger : stagger;
}

function drawOverlays(ctx: CanvasRenderingContext2D, state: ShowState, rc: RenderContext, nowMs: number) {
  const byId = new Map<string, Template>();
  for (const t of state.templates ?? []) byId.set(t.id, t);
  const items: { o: OverlayInstance; t: Template }[] = [];
  for (const o of state.overlays ?? []) {
    const t = byId.get(o.templateId);
    if (t) items.push({ o, t });
  }
  // Full-screen overlays (break spot, pause) cover the program; the rest sit on top of them.
  const ordered = [...items.filter((x) => x.t.fullScreen), ...items.filter((x) => !x.t.fullScreen)];
  for (const { o, t } of ordered) guarded(ctx, `overlay ${t.id}`, () => drawOverlay(ctx, o, t, rc, nowMs));
}

const BINDING_KEYS = /\{\{\s*([^{}]*?)\s*\}\}/g;

/**
 * False when a non-full-screen template would air as empty boxes: it has text nodes with bindings
 * and every one of those bindings resolves to ''. Static text (logo bug) and full-screen templates
 * always count as content.
 */
export function templateHasContent(t: Template, rc: RenderContext): boolean {
  if (t.fullScreen) return true;
  let bound = false;
  for (const n of Array.isArray(t.nodes) ? t.nodes : []) {
    if (n.type !== 'text' || !n.text || n.text.indexOf('{{') < 0) continue;
    bound = true;
    for (const m of n.text.matchAll(BINDING_KEYS)) {
      if (resolveBindings(`{{${m[1]}}}`, rc).trim() !== '') return true;
    }
  }
  return !bound;
}

function drawOverlay(ctx: CanvasRenderingContext2D, o: OverlayInstance, t: Template, rc: RenderContext, nowMs: number) {
  const nodes = Array.isArray(t.nodes) ? t.nodes : [];
  if (nodes.length === 0) return;
  if (!templateHasContent(t, rc)) return; // never air empty bars
  const anim = o.visible ? t.animIn : t.animOut;
  if (!anim) return;
  const progress = nodes.map((n, i) => overlayProgress(o, anim, nowMs, nodeDelay(n, i, anim, o.visible)));
  if (progress.every((p) => p <= 0)) return;
  const bounds = boundsOf(nodes);
  nodes.forEach((n, i) => {
    const p = progress[i];
    if (p <= 0) return;
    guarded(ctx, `node ${t.id}/${n.id}`, () => {
      applyAnim(ctx, anim, p, bounds);
      ctx.globalAlpha *= clamp01(n.opacity ?? 1);
      drawNode(ctx, n, rc);
    });
  });
}

function applyAnim(ctx: CanvasRenderingContext2D, anim: OverlayAnim, p: number, b: Bounds) {
  if (p >= 1 || anim.kind === 'none') return;
  const e = ease(anim.easing, p);
  switch (anim.kind) {
    case 'fade':
      ctx.globalAlpha *= clamp01(e);
      return;
    case 'slide': {
      const from = anim.from ?? 'bottom';
      const d = SLIDE_PX * (1 - e);
      const dx = from === 'left' ? -d : from === 'right' ? d : 0;
      const dy = from === 'top' ? -d : from === 'bottom' ? d : 0;
      ctx.translate(dx, dy);
      ctx.globalAlpha *= clamp01(e);
      return;
    }
    case 'scale': {
      const s = SCALE_FROM + (1 - SCALE_FROM) * e;
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      ctx.translate(cx, cy);
      ctx.scale(s, s);
      ctx.translate(-cx, -cy);
      ctx.globalAlpha *= clamp01(e);
      return;
    }
    case 'wipe': {
      const k = clamp01(e);
      const from = anim.from ?? 'left';
      const r: Rect =
        from === 'left'
          ? { x: b.x, y: b.y, w: b.w * k, h: b.h }
          : from === 'right'
            ? { x: b.x + b.w * (1 - k), y: b.y, w: b.w * k, h: b.h }
            : from === 'top'
              ? { x: b.x, y: b.y, w: b.w, h: b.h * k }
              : { x: b.x, y: b.y + b.h * (1 - k), w: b.w, h: b.h * k };
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.w, r.h);
      ctx.clip();
      return;
    }
  }
}

function drawNode(ctx: CanvasRenderingContext2D, n: TemplateNode, rc: RenderContext) {
  switch (n.type) {
    case 'rect':
      return drawRectNode(ctx, n);
    case 'text':
      return drawTextNode(ctx, n, rc);
    case 'image':
      return drawImageNode(ctx, n, rc);
  }
}

function roundedPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawRectNode(ctx: CanvasRenderingContext2D, n: TemplateNode) {
  if (!n.fill || !(n.w > 0) || !(n.h > 0)) return;
  ctx.fillStyle = n.fill;
  if (n.radius && n.radius > 0) {
    roundedPath(ctx, n.x, n.y, n.w, n.h, n.radius);
    ctx.fill();
  } else {
    ctx.fillRect(n.x, n.y, n.w, n.h);
  }
}

// ---- text ----

export function fontString(family: string, weight: number, size: number): string {
  return `${weight} ${size}px "${family}", ${FONT_FALLBACK}`;
}

type FittedText = { text: string; font: string; size: number };
const fitCache = new Map<string, FittedText>();
const capCache = new Map<string, number>();
const CACHE_MAX = 512;

/** Drops cached text measurements (call after fonts finish loading — fallback metrics differ). */
export function clearTextCaches() {
  fitCache.clear();
  capCache.clear();
}

function remember<K, V>(m: Map<K, V>, k: K, v: V): V {
  if (m.size >= CACHE_MAX) m.clear();
  m.set(k, v);
  return v;
}

/**
 * Fits `text` into `maxW` on one line: shrink down to 70 % of `size`, then truncate with an ellipsis.
 * Results are cached per (font, size, width, text) — measureText is the hot path at 30 fps.
 */
export function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  family: string,
  weight: number,
  size: number,
  maxW: number,
): FittedText {
  const key = `${family}|${weight}|${size}|${maxW}|${text}`;
  const hit = fitCache.get(key);
  if (hit) return hit;
  const measure = (s: number, t: string) => {
    ctx.font = fontString(family, weight, s);
    return ctx.measureText(t).width;
  };
  const full = measure(size, text);
  if (full <= maxW || !(maxW > 0)) return remember(fitCache, key, { text, font: fontString(family, weight, size), size });
  const minSize = Math.max(1, Math.floor(size * MIN_TEXT_SCALE));
  const shrunk = Math.max(minSize, Math.floor((size * maxW) / full));
  if (measure(shrunk, text) <= maxW) return remember(fitCache, key, { text, font: fontString(family, weight, shrunk), size: shrunk });
  // Still too wide at the minimum size: binary-search the longest prefix that fits with an ellipsis.
  const chars = Array.from(text);
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(minSize, chars.slice(0, mid).join('').trimEnd() + '…') <= maxW) lo = mid;
    else hi = mid - 1;
  }
  const out = lo > 0 ? chars.slice(0, lo).join('').trimEnd() + '…' : '…';
  return remember(fitCache, key, { text: out, font: fontString(family, weight, minSize), size: minSize });
}

/** Cap height of a font, for optically centring text in its box. */
function capHeight(ctx: CanvasRenderingContext2D, font: string, size: number): number {
  const hit = capCache.get(font);
  if (hit !== undefined) return hit;
  ctx.font = font;
  const m = ctx.measureText('H');
  const v = typeof m.actualBoundingBoxAscent === 'number' && m.actualBoundingBoxAscent > 0 ? m.actualBoundingBoxAscent : size * 0.72;
  return remember(capCache, font, v);
}

function drawTextNode(ctx: CanvasRenderingContext2D, n: TemplateNode, rc: RenderContext) {
  const value = resolveBindings(n.text ?? '', rc).replace(/\s+/g, ' ').trim();
  if (!value) return;
  const family = n.font ?? 'Inter';
  const weight = n.weight ?? 600;
  const size = n.size && n.size > 0 ? n.size : 28;
  const fitted = fitText(ctx, value, family, weight, size, n.w);
  const align = n.align ?? 'left';
  const x = align === 'center' ? n.x + n.w / 2 : align === 'right' ? n.x + n.w : n.x;
  const cap = capHeight(ctx, fitted.font, fitted.size);
  ctx.font = fitted.font;
  ctx.fillStyle = n.color ?? '#FFFFFF';
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(fitted.text, x, n.y + n.h / 2 + cap / 2);
}

// ---- images ----

type CachedImage = { img: HTMLImageElement; state: 'loading' | 'ok' | 'failed'; failedAt: number };
const images = new Map<string, CachedImage>();

function loadInto(entry: CachedImage, src: string) {
  entry.state = 'loading';
  entry.img.onload = () => {
    entry.state = 'ok';
  };
  entry.img.onerror = () => {
    entry.state = 'failed';
    entry.failedAt = Date.now();
  };
  entry.img.src = src;
}

/** Returns a loaded image for `src`, or null while loading / after a failure (retried at most every 30 s). */
export function cachedImage(src: string): HTMLImageElement | null {
  if (!src || typeof Image === 'undefined') return null;
  let entry = images.get(src);
  if (!entry) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    entry = { img, state: 'loading', failedAt: 0 };
    images.set(src, entry);
    loadInto(entry, src);
    return null;
  }
  if (entry.state === 'failed' && Date.now() - entry.failedAt >= IMAGE_RETRY_MS) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    entry.img = img;
    loadInto(entry, src);
    return null;
  }
  return entry.state === 'ok' ? entry.img : null;
}

/** Test/dev helper. */
export function clearImageCache() {
  images.clear();
}

function drawImageNode(ctx: CanvasRenderingContext2D, n: TemplateNode, rc: RenderContext) {
  const src = resolveBindings(n.src ?? '', rc).trim();
  const img = cachedImage(src);
  if (!img || !(img.naturalWidth > 0)) return;
  const box: Rect = { x: n.x, y: n.y, w: n.w, h: n.h };
  const fit = n.fit ?? 'contain';
  const dst = fitRect(img.naturalWidth, img.naturalHeight, box, fit);
  if (fit === 'cover' || n.radius) {
    if (n.radius && n.radius > 0) roundedPath(ctx, box.x, box.y, box.w, box.h, n.radius);
    else {
      ctx.beginPath();
      ctx.rect(box.x, box.y, box.w, box.h);
    }
    ctx.clip();
  }
  ctx.drawImage(img, dst.x, dst.y, dst.w, dst.h);
}
