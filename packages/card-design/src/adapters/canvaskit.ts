// SkiaApi for CanvasKit (Studio web/desktop, Node server, golden tests).
import CanvasKitInit from 'canvaskit-wasm';
import type { CanvasKit, Canvas, Image, Paint, Paragraph, RuntimeEffect, TypefaceFontProvider } from 'canvaskit-wasm';
import type { CardDesign } from '../schema';
import type { BlendModeName, CanvasLike, FontSet, PaintOptions, SkiaApi, SkImageLike } from '../draw/api';
import { drawDesign, drawHeight, type DrawOptions } from '../draw/draw';
import { parseHex } from '../draw/presets';
import { loadFontSet } from '../fonts';

export function createCanvasKitApi(ck: CanvasKit): SkiaApi {
  const effects = new Map<string, RuntimeEffect | null>();
  const blend = (m: BlendModeName) =>
    ({ srcOver: ck.BlendMode.SrcOver, srcATop: ck.BlendMode.SrcATop, screen: ck.BlendMode.Screen, softLight: ck.BlendMode.SoftLight, plus: ck.BlendMode.Plus })[m];
  const color = (hex: string) => {
    const [r, g, b, a] = parseHex(hex);
    return ck.Color(r, g, b, a / 255);
  };
  const align = { left: ck.TextAlign.Left, center: ck.TextAlign.Center, right: ck.TextAlign.Right };

  const api: SkiaApi = {
    makePaint(opts: PaintOptions = {}) {
      const p = new ck.Paint();
      p.setAntiAlias(true);
      if (opts.color) p.setColor(opts.color as Float32Array);
      if (opts.shader) p.setShader(opts.shader as never);
      if (opts.alpha !== undefined) p.setAlphaf((opts.color ? (opts.color as Float32Array)[3] : 1) * opts.alpha);
      if (opts.blend) p.setBlendMode(blend(opts.blend));
      if (opts.stroke !== undefined) {
        p.setStyle(ck.PaintStyle.Stroke);
        p.setStrokeWidth(opts.stroke);
      }
      return p;
    },
    makeRRect: (x, y, w, h, r) => ck.RRectXY(ck.XYWHRect(x, y, w, h), r, r),
    makeLinearGradient: (p0, p1, colors, positions) =>
      ck.Shader.MakeLinearGradient(p0, p1, colors as Float32Array[], positions, ck.TileMode.Clamp),
    makeRadialGradient: (c, r, colors, positions) =>
      ck.Shader.MakeRadialGradient(c, r, colors as Float32Array[], positions, ck.TileMode.Clamp),
    makeRuntimeShader(sksl, uniforms) {
      if (!effects.has(sksl)) effects.set(sksl, ck.RuntimeEffect.Make(sksl) ?? null);
      const effect = effects.get(sksl);
      return effect ? effect.makeShader(uniforms) : null;
    },
    makeImage: (bytes) => ck.MakeImageFromEncoded(bytes),
    makeFontProvider: () => ck.TypefaceFontProvider.Make(),
    registerFont(provider, bytes, family) {
      const face = ck.Typeface.MakeTypefaceFromData(bytes as unknown as ArrayBuffer);
      if (!face) return false;
      face.delete();
      (provider as TypefaceFontProvider).registerFont(bytes, family);
      return true;
    },
    makeParagraph(text, style, width, fonts) {
      if (!fonts.families.has(style.font)) return null;
      const pStyle = new ck.ParagraphStyle({
        textAlign: align[style.align],
        textStyle: {
          color: color(style.color),
          fontFamilies: [style.font],
          fontSize: style.size,
          letterSpacing: style.letterSpacing * style.size,
        },
      });
      const builder = ck.ParagraphBuilder.MakeFromFontProvider(pStyle, fonts.provider as TypefaceFontProvider);
      builder.addText(text);
      const para = builder.build();
      builder.delete();
      para.layout(width);
      return para;
    },
    colorFromHex: color,
    wrapCanvas: (native) => wrapCanvas(ck, native as Canvas),
    dispose(obj) {
      const o = obj as { delete?: () => void; isDeleted?: () => boolean } | null;
      if (o && typeof o.delete === 'function' && !o.isDeleted?.()) o.delete();
    },
  };
  return api;
}

function wrapCanvas(ck: CanvasKit, c: Canvas): CanvasLike {
  return {
    save: () => { c.save(); },
    restore: () => c.restore(),
    saveLayer: (paint) => { c.saveLayer(paint as Paint | undefined); },
    translate: (dx, dy) => c.translate(dx, dy),
    rotate: (deg, cx, cy) => c.rotate(deg, cx, cy),
    scale: (sx, sy) => c.scale(sx, sy),
    clipRRect: (rr) => c.clipRRect(rr as Float32Array, ck.ClipOp.Intersect, true),
    drawRect: ([x, y, w, h], paint) => c.drawRect(ck.XYWHRect(x, y, w, h), paint as Paint),
    drawRRect: (rr, paint) => c.drawRRect(rr as Float32Array, paint as Paint),
    drawImageRect: (img, [sx, sy, sw, sh], [dx, dy, dw, dh], paint) =>
      c.drawImageRect(img as Image, ck.XYWHRect(sx, sy, sw, sh), ck.XYWHRect(dx, dy, dw, dh), paint as Paint),
    drawParagraph: (p, x, y) => c.drawParagraph(p as Paragraph, x, y),
  };
}

// ---- Loading and rendering (Node and web) ----

let ckPromise: Promise<CanvasKit> | null = null;
const isNode = typeof process !== 'undefined' && !!process.versions?.node;

/**
 * Loads CanvasKit once. In Node the wasm is read from the installed canvaskit-wasm
 * package; in a browser pass `locateFile` (file name → URL of canvaskit.wasm).
 */
export function loadCanvasKit(opts: { locateFile?: (file: string) => string } = {}): Promise<CanvasKit> {
  if (!ckPromise) {
    ckPromise = (async () => {
      let locateFile = opts.locateFile;
      if (!locateFile && isNode) {
        const { createRequire } = await import('node:module');
        const path = await import('node:path');
        const wasm = createRequire(import.meta.url).resolve('canvaskit-wasm/bin/canvaskit.wasm');
        locateFile = (file) => path.join(path.dirname(wasm), file);
      }
      return CanvasKitInit(locateFile ? { locateFile } : undefined);
    })();
    ckPromise.catch(() => { ckPromise = null; });
  }
  return ckPromise;
}

/** Reads a file shipped with this package (fonts/…, assets/…) in Node. */
export async function readPackageFile(relative: string): Promise<Uint8Array> {
  const { readFile } = await import('node:fs/promises');
  return new Uint8Array(await readFile(new URL(`../../${relative}`, import.meta.url)));
}

const defaultFonts = new WeakMap<CanvasKit, Promise<FontSet>>();

/** The curated font set read from the package's fonts/ directory (Node only). */
export function nodeFontSet(ck: CanvasKit, api: SkiaApi = createCanvasKitApi(ck)): Promise<FontSet> {
  let fonts = defaultFonts.get(ck);
  if (!fonts) {
    fonts = loadFontSet(api, (file) => readPackageFile(`fonts/${file}`));
    defaultFonts.set(ck, fonts);
  }
  return fonts;
}

export type RenderPngOptions = Omit<DrawOptions, 'fonts' | 'images'> & {
  fonts?: FontSet;
  images?: Map<string, SkImageLike>;
  ck?: CanvasKit;
};

/**
 * Renders a design to PNG bytes. In Node, fonts default to the package's fonts.
 * In the browser pass `ck` and `fonts` explicitly.
 */
export async function renderPng(design: CardDesign, opts: RenderPngOptions): Promise<Uint8Array> {
  const ck = opts.ck ?? (await loadCanvasKit());
  const api = createCanvasKitApi(ck);
  const fonts = opts.fonts ?? (await nodeFontSet(ck, api));
  const images = opts.images ?? new Map<string, SkImageLike>();
  const width = Math.round(opts.width);
  const height = drawHeight(design, width);
  const surface = ck.MakeSurface(width, height);
  if (!surface) throw new Error(`renderPng: cannot create a ${width}x${height} surface`);
  try {
    const canvas = surface.getCanvas();
    canvas.clear(ck.TRANSPARENT);
    drawDesign(api, api.wrapCanvas(canvas), design, { ...opts, width, fonts, images });
    surface.flush();
    const snapshot = surface.makeImageSnapshot();
    const png = snapshot.encodeToBytes();
    snapshot.delete();
    if (!png) throw new Error('renderPng: PNG encoding failed');
    return png;
  } finally {
    surface.delete();
  }
}
