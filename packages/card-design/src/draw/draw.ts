// Draws a CardDesign with any SkiaApi implementation. Never throws on missing
// assets or fonts: such a layer is skipped and the rest of the card draws.
import { CARD_RADIUS, designSize, type CardDesign, type Layer } from '../schema';
import { resolveText, type FieldValues, type RenderMode } from '../fields';
import type { CanvasLike, FontSet, ShaderLike, SkiaApi, SkImageLike, XYWH } from './api';
import { PRESETS, tintedStops } from './presets';
import { SHINE_SKSL, shineUniforms } from './shine';

export interface DrawOptions {
  /** Output width in pixels; card units are scaled to it. */
  width: number;
  mode: RenderMode;
  values?: FieldValues;
  images: Map<string, SkImageLike>;
  fonts: FontSet;
  /** 0..1 position of the moving sheen. */
  shinePhase: number;
  /** Device tilt, each axis -1..1. */
  tilt?: { x: number; y: number };
  reducedMotion?: boolean;
  /**
   * Draw the card-wide foil (default true). False when the caller draws it live on top instead
   * (the app animates SHINE_SKSL on the UI thread with the tilt as uniforms).
   */
  cardShine?: boolean;
}

/** Output height in pixels for a design drawn at `width`. */
export function drawHeight(design: CardDesign, width: number): number {
  const { w, h } = designSize(design.format);
  return Math.round((width * h) / w);
}

export function drawDesign(api: SkiaApi, canvas: CanvasLike, design: CardDesign, opts: DrawOptions): void {
  const created: unknown[] = [];
  const track = <T>(o: T): T => { if (o) created.push(o); return o; };
  const { w: W, h: H } = designSize(design.format);
  const radius = design.format === 'stamp' ? W / 2 : CARD_RADIUS;
  const shine = (): ShaderLike | null =>
    track(api.makeRuntimeShader(SHINE_SKSL, shineUniforms(opts.shinePhase, opts.tilt, design.shine.intensity, W, H, opts.reducedMotion)));

  canvas.save();
  try {
    canvas.scale(opts.width / W, opts.width / W);
    const shape = track(api.makeRRect(0, 0, W, H, radius));
    canvas.clipRRect(shape);

    drawBackground(api, canvas, design, W, H, opts.images, track);

    for (const layer of design.layers) {
      try {
        drawLayer(api, canvas, layer, opts, shine, track);
      } catch {
        // A broken layer must not take the card down; skip it.
      }
    }

    if (opts.cardShine !== false && design.shine.enabled && design.shine.intensity > 0) {
      const s = shine();
      if (s) canvas.drawRect([0, 0, W, H], track(api.makePaint({ shader: s })));
    }

    const preset = design.background.kind === 'preset' ? PRESETS[design.background.preset] : undefined;
    const border = design.border ?? preset?.rim;
    if (border && border.width > 0) {
      const inset = border.width / 2;
      const rim = track(api.makeRRect(inset, inset, W - border.width, H - border.width, Math.max(0, radius - inset)));
      canvas.drawRRect(rim, track(api.makePaint({ color: api.colorFromHex(border.color), stroke: border.width })));
    }
  } finally {
    canvas.restore();
    for (const o of created) api.dispose(o);
  }
}

function drawBackground(
  api: SkiaApi, canvas: CanvasLike, design: CardDesign, W: number, H: number,
  images: Map<string, SkImageLike>, track: <T>(o: T) => T,
): void {
  const bg = design.background;
  if (bg.kind === 'image') {
    const img = images.get(bg.assetId);
    if (!img) {
      canvas.drawRect([0, 0, W, H], track(api.makePaint({ color: api.colorFromHex('#E5E5E3') })));
      return;
    }
    const paint = track(api.makePaint());
    const iw = img.width(), ih = img.height();
    if (bg.fit === 'cover') {
      const s = Math.max(W / iw, H / ih);
      const sw = W / s, sh = H / s;
      canvas.drawImageRect(img, [(iw - sw) / 2, (ih - sh) / 2, sw, sh], [0, 0, W, H], paint);
    } else {
      // Tiles at the image's pixel size in card units, scaled up so there are at most 16 per row.
      const tw = Math.max(iw, W / 16), th = (tw * ih) / iw;
      for (let y = 0; y < H; y += th) for (let x = 0; x < W; x += tw) canvas.drawImageRect(img, [0, 0, iw, ih], [x, y, tw, th], paint);
    }
    return;
  }
  const p = PRESETS[bg.preset];
  const stops = p.tintable && bg.color ? tintedStops(bg.color.slice(0, 7), p.stops.length) : p.stops;
  const base = track(api.makeLinearGradient(
    [p.from[0] * W, p.from[1] * H], [p.to[0] * W, p.to[1] * H], stops.map((c) => api.colorFromHex(c)), p.positions,
  ));
  canvas.drawRect([0, 0, W, H], track(api.makePaint({ shader: base })));
  for (const g of p.glows) {
    const glow = track(api.makeRadialGradient(
      [g.x * W, g.y * H], g.r * W, [api.colorFromHex(g.color), api.colorFromHex(g.color.slice(0, 7) + '00')], [0, 1],
    ));
    canvas.drawRect([0, 0, W, H], track(api.makePaint({ shader: glow })));
  }
}

function drawLayer(
  api: SkiaApi, canvas: CanvasLike, layer: Layer, opts: DrawOptions,
  shine: () => ShaderLike | null, track: <T>(o: T) => T,
): void {
  if (layer.opacity <= 0) return;

  // Resolve content first so a missing asset or font skips the layer entirely.
  let content: (() => void) | null = null;
  if (layer.type === 'image') {
    const img = opts.images.get(layer.assetId);
    if (!img) return;
    const iw = img.width(), ih = img.height();
    if (!(iw > 0 && ih > 0)) return;
    const s = Math.min(layer.w / iw, layer.h / ih);
    const dw = iw * s, dh = ih * s;
    const dst: XYWH = [layer.x + (layer.w - dw) / 2, layer.y + (layer.h - dh) / 2, dw, dh];
    const paint = track(api.makePaint());
    content = () => canvas.drawImageRect(img, [0, 0, iw, ih], dst, paint);
  } else {
    const raw = resolveText(layer, opts.mode, opts.values ?? {});
    if (raw === null || raw.length === 0) return;
    const text = layer.uppercase ? raw.toLocaleUpperCase('de-DE') : raw;
    const para = track(api.makeParagraph(text, layer, layer.w, opts.fonts));
    if (!para) return;
    content = () => canvas.drawParagraph(para, layer.x, layer.y);
  }

  canvas.save();
  if (layer.rotation !== 0) canvas.rotate(layer.rotation, layer.x + layer.w / 2, layer.y + layer.h / 2);
  const needsLayer = layer.opacity < 1 || layer.shine;
  if (needsLayer) canvas.saveLayer(layer.opacity < 1 ? track(api.makePaint({ alpha: layer.opacity })) : undefined);
  content();
  if (layer.shine) {
    const s = shine();
    // srcATop keeps the sheen on the layer's own pixels.
    if (s) canvas.drawRect(layerBounds(layer), track(api.makePaint({ shader: s, blend: 'srcATop' })));
  }
  if (needsLayer) canvas.restore();
  canvas.restore();
}

function layerBounds(layer: Layer): XYWH {
  // Text may overflow its box vertically; cover generously.
  const pad = layer.type === 'image' ? 0 : layer.h;
  return [layer.x - pad, layer.y - pad, layer.w + 2 * pad, layer.h + 2 * pad];
}
