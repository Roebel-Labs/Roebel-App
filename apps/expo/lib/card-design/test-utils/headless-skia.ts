// Test-only: RN Skia's own web implementation (JsiSkApi over CanvasKit) driven headless in Jest, so
// the app's adapter (`createRnSkiaApi`) runs against the real RN Skia object model, not a mock.
// Fonts and built-in art are read from packages/card-design on disk.
import * as fs from 'fs';
import * as path from 'path';
import { BUILTIN_ASSETS, FONT_FILES, drawDesign, drawHeight, type CardDesign, type DrawOptions, type FontId, type FontSet, type SkImageLike, type SkiaApi } from '@roebel/card-design';
import { createRnSkiaApi, type RnSkiaLike } from '@roebel/card-design/rn-skia';

export const PACKAGE_DIR = path.resolve(__dirname, '../../../../../packages/card-design');

type Headless = { Skia: RnSkiaLike & Record<string, any>; api: SkiaApi; fonts: FontSet; images: Map<string, SkImageLike> };

let loaded: Promise<Headless> | null = null;

/** CanvasKit (the version RN Skia ships) + JsiSkApi + the curated fonts + all built-in art. */
export function loadHeadlessSkia(): Promise<Headless> {
  if (!loaded) loaded = load();
  return loaded;
}

async function load(): Promise<Headless> {
  const skiaDir = path.dirname(require.resolve('@shopify/react-native-skia/package.json'));
  const ckPath = require.resolve('canvaskit-wasm/bin/full/canvaskit', { paths: [skiaDir] });
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const CanvasKitInit = require(ckPath);
  // jest-expo installs Expo's UTF-8-only TextDecoder; CanvasKit's loader also needs utf-16le.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  (globalThis as { TextDecoder: unknown }).TextDecoder = require('util').TextDecoder;
  const CanvasKit = await CanvasKitInit({ locateFile: (f: string) => path.join(path.dirname(ckPath), f) });
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { JsiSkApi } = require('@shopify/react-native-skia/lib/commonjs/skia/web');
  const Skia = JsiSkApi(CanvasKit);
  const api = createRnSkiaApi(Skia);
  const provider = api.makeFontProvider();
  const families = new Set<FontId>();
  for (const [id, file] of Object.entries(FONT_FILES) as [FontId, string][]) {
    if (api.registerFont(provider, new Uint8Array(fs.readFileSync(path.join(PACKAGE_DIR, 'fonts', file))), id)) families.add(id);
  }
  const images = new Map<string, SkImageLike>();
  for (const [id, rel] of Object.entries(BUILTIN_ASSETS)) {
    const img = api.makeImage(new Uint8Array(fs.readFileSync(path.join(PACKAGE_DIR, rel))));
    if (img) images.set(id, img);
  }
  return { Skia, api, fonts: { provider, families }, images };
}

export type RenderOptions = Omit<DrawOptions, 'fonts' | 'images'> & { images?: Map<string, SkImageLike> };

/** Draws `design` onto an offscreen RN Skia surface; returns RGBA pixels (unpremultiplied). */
export async function renderRgba(design: CardDesign, opts: RenderOptions): Promise<{ width: number; height: number; data: Uint8Array }> {
  const h = await loadHeadlessSkia();
  const width = Math.round(opts.width);
  const height = drawHeight(design, width);
  const surface = h.Skia.Surface.Make(width, height);
  if (!surface) throw new Error('no surface');
  const canvas = surface.getCanvas();
  canvas.clear(h.Skia.Color('transparent'));
  drawDesign(h.api, h.api.wrapCanvas(canvas), design, { ...opts, width, fonts: h.fonts, images: opts.images ?? h.images });
  surface.flush();
  const image = surface.makeImageSnapshot();
  const pixels = image.readPixels(0, 0, { width, height, colorType: 4 /* RGBA_8888 */, alphaType: 3 /* Unpremul */ });
  if (!pixels) throw new Error('readPixels failed');
  return { width, height, data: new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength) };
}

/**
 * Share of pixels whose colour differs noticeably — the YIQ distance pixelmatch uses
 * (threshold 0.1, as D1's golden test), blended over white, without its anti-aliasing exemption
 * (so it is the stricter of the two).
 */
export function diffRatio(a: Uint8Array, b: Uint8Array, threshold = 0.1): number {
  if (a.length !== b.length) return 1;
  const max = 35215 * threshold * threshold;
  let diff = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (yiqDelta(a, b, i) > max) diff++;
  }
  return diff / (a.length / 4);
}

function blend(c: number, alpha: number): number {
  return 255 + (c - 255) * alpha;
}

function yiqDelta(a: Uint8Array, b: Uint8Array, i: number): number {
  const aa = a[i + 3] / 255, ba = b[i + 3] / 255;
  const r1 = blend(a[i], aa), g1 = blend(a[i + 1], aa), b1 = blend(a[i + 2], aa);
  const r2 = blend(b[i], ba), g2 = blend(b[i + 1], ba), b2 = blend(b[i + 2], ba);
  const y = (r: number, g: number, bl: number) => r * 0.29889531 + g * 0.58662247 + bl * 0.11448223;
  const iq = (r: number, g: number, bl: number) => r * 0.59597799 - g * 0.2741761 - bl * 0.32180189;
  const q = (r: number, g: number, bl: number) => r * 0.21147017 - g * 0.52261711 + bl * 0.31114694;
  const dy = y(r1, g1, b1) - y(r2, g2, b2);
  const di = iq(r1, g1, b1) - iq(r2, g2, b2);
  const dq = q(r1, g1, b1) - q(r2, g2, b2);
  return 0.5053 * dy * dy + 0.299 * di * di + 0.1957 * dq * dq;
}
