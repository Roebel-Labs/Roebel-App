// SkiaApi for @shopify/react-native-skia (the Röbel App). This file must not import
// React Native: the Skia object is passed in by the app (`createRnSkiaApi(Skia)`).
// The types below are the structural subset of RN Skia this adapter uses, so the
// package typechecks without the native dependency; the real `Skia` satisfies them.
import type { BlendModeName, CanvasLike, PaintOptions, SkiaApi } from '../draw/api';
import { parseHex } from '../draw/presets';

type Native = object;
interface RnPoint { x: number; y: number }
interface RnPaint {
  setAntiAlias(aa: boolean): void;
  setColor(c: Native): void;
  setShader(s: Native | null): void;
  setAlphaf(a: number): void;
  setBlendMode(m: number): void;
  setStyle(s: number): void;
  setStrokeWidth(w: number): void;
}
interface RnParagraphBuilder {
  pushStyle(style: object): RnParagraphBuilder;
  addText(text: string): RnParagraphBuilder;
  build(): RnParagraph;
  dispose?(): void;
}
// RN Skia's canvas has no drawParagraph: a paragraph paints itself onto a canvas.
interface RnParagraph { layout(width: number): void; getHeight(): number; paint(canvas: Native, x: number, y: number): void }
interface RnCanvas {
  save(): number | void;
  restore(): void;
  saveLayer(paint?: Native, bounds?: Native | null, backdrop?: Native | null, flags?: number): number | void;
  translate(dx: number, dy: number): void;
  rotate(deg: number, rx: number, ry: number): void;
  scale(sx: number, sy: number): void;
  clipRRect(rrect: Native, op: number, aa: boolean): void;
  drawRect(rect: Native, paint: Native): void;
  drawRRect(rrect: Native, paint: Native): void;
  drawImageRect(img: Native, src: Native, dst: Native, paint: Native, fastSample?: boolean): void;
}

/** The parts of RN Skia's `Skia` object this adapter uses. */
export interface RnSkiaLike {
  Paint(): RnPaint;
  Point(x: number, y: number): RnPoint;
  XYWHRect(x: number, y: number, w: number, h: number): Native;
  RRectXY(rect: Native, rx: number, ry: number): Native;
  Color(c: string | number[] | Float32Array): Native;
  Shader: {
    MakeLinearGradient(start: RnPoint, end: RnPoint, colors: Native[], pos: number[] | null, mode: number): Native;
    MakeRadialGradient(center: RnPoint, r: number, colors: Native[], pos: number[] | null, mode: number): Native;
  };
  RuntimeEffect: { Make(sksl: string): { makeShader(uniforms: number[]): Native } | null };
  Data: { fromBytes(bytes: Uint8Array): Native };
  Image: { MakeImageFromEncoded(data: Native): { width(): number; height(): number } | null };
  Typeface: { MakeFreeTypeFaceFromData(data: Native): Native | null };
  TypefaceFontProvider: { Make(): { registerFont(typeface: Native, family: string): void } };
  ParagraphBuilder: { Make(style: object, provider?: Native): RnParagraphBuilder };
}

// RN Skia enum values (mirror Skia's C++ enums).
const BLEND: Record<BlendModeName, number> = { srcOver: 3, srcATop: 9, plus: 12, screen: 14, softLight: 21 };
const TILE_CLAMP = 0;
const CLIP_INTERSECT = 1;
const PAINT_STROKE = 1;
const TEXT_ALIGN = { left: 0, right: 1, center: 2 } as const;

export function createRnSkiaApi(Skia: RnSkiaLike): SkiaApi {
  const effects = new Map<string, ReturnType<RnSkiaLike['RuntimeEffect']['Make']>>();
  const color = (hex: string) => {
    const [r, g, b, a] = parseHex(hex);
    return Skia.Color(new Float32Array([r / 255, g / 255, b / 255, a / 255]));
  };
  const rect = (x: number, y: number, w: number, h: number) => Skia.XYWHRect(x, y, w, h);

  return {
    makePaint(opts: PaintOptions = {}) {
      const p = Skia.Paint();
      p.setAntiAlias(true);
      if (opts.color) p.setColor(opts.color);
      if (opts.shader) p.setShader(opts.shader);
      if (opts.alpha !== undefined) p.setAlphaf((opts.color ? (opts.color as Float32Array)[3] : 1) * opts.alpha);
      if (opts.blend) p.setBlendMode(BLEND[opts.blend]);
      if (opts.stroke !== undefined) {
        p.setStyle(PAINT_STROKE);
        p.setStrokeWidth(opts.stroke);
      }
      return p as Native;
    },
    makeRRect: (x, y, w, h, r) => Skia.RRectXY(rect(x, y, w, h), r, r),
    makeLinearGradient: (p0, p1, colors, positions) =>
      Skia.Shader.MakeLinearGradient(Skia.Point(...p0), Skia.Point(...p1), colors, positions, TILE_CLAMP),
    makeRadialGradient: (c, r, colors, positions) =>
      Skia.Shader.MakeRadialGradient(Skia.Point(...c), r, colors, positions, TILE_CLAMP),
    makeRuntimeShader(sksl, uniforms) {
      if (!effects.has(sksl)) effects.set(sksl, Skia.RuntimeEffect.Make(sksl));
      const effect = effects.get(sksl);
      return effect ? effect.makeShader(uniforms) : null;
    },
    makeImage: (bytes) => Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(bytes)),
    makeFontProvider: () => Skia.TypefaceFontProvider.Make(),
    registerFont(provider, bytes, family) {
      const face = Skia.Typeface.MakeFreeTypeFaceFromData(Skia.Data.fromBytes(bytes));
      if (!face) return false;
      (provider as ReturnType<RnSkiaLike['TypefaceFontProvider']['Make']>).registerFont(face, family);
      return true;
    },
    makeParagraph(text, style, width, fonts) {
      if (!fonts.families.has(style.font)) return null;
      const builder = Skia.ParagraphBuilder.Make({ textAlign: TEXT_ALIGN[style.align] }, fonts.provider);
      builder.pushStyle({
        color: color(style.color),
        fontFamilies: [style.font],
        fontSize: style.size,
        letterSpacing: style.letterSpacing * style.size,
      });
      builder.addText(text);
      const para = builder.build();
      builder.dispose?.();
      para.layout(width);
      return para;
    },
    colorFromHex: color,
    wrapCanvas: (native) => wrapCanvas(Skia, native as RnCanvas),
    dispose(obj) {
      const o = obj as { dispose?: () => void } | null;
      if (o && typeof o.dispose === 'function') o.dispose();
    },
  };
}

function wrapCanvas(Skia: RnSkiaLike, c: RnCanvas): CanvasLike {
  const r = (x: number, y: number, w: number, h: number) => Skia.XYWHRect(x, y, w, h);
  return {
    save: () => { c.save(); },
    restore: () => c.restore(),
    saveLayer: (paint) => { c.saveLayer(paint); },
    translate: (dx, dy) => c.translate(dx, dy),
    rotate: (deg, cx, cy) => c.rotate(deg, cx, cy),
    scale: (sx, sy) => c.scale(sx, sy),
    clipRRect: (rr) => c.clipRRect(rr, CLIP_INTERSECT, true),
    drawRect: ([x, y, w, h], paint) => c.drawRect(r(x, y, w, h), paint),
    drawRRect: (rr, paint) => c.drawRRect(rr, paint),
    drawImageRect: (img, [sx, sy, sw, sh], [dx, dy, dw, dh], paint) =>
      c.drawImageRect(img as Native, r(sx, sy, sw, sh), r(dx, dy, dw, dh), paint),
    drawParagraph: (p, x, y) => (p as unknown as RnParagraph).paint(c, x, y),
  };
}
