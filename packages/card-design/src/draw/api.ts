// The small Skia surface the drawing code needs. CanvasKit (web/Node) and
// @shopify/react-native-skia (app) each implement it in src/adapters/, so the
// drawing in draw.ts is written once and renders identically on both.
import type { FontId, TextStyle } from '../schema';

// Native objects are opaque to the drawing code; the adapters cast them.
export type ColorLike = { readonly __skColor?: never } & object;
export type PaintLike = { readonly __skPaint?: never } & object;
export type ShaderLike = { readonly __skShader?: never } & object;
export type RRectLike = { readonly __skRRect?: never } & object;
export type FontProviderLike = { readonly __skFontProvider?: never } & object;

export interface SkImageLike {
  width(): number;
  height(): number;
}

export interface ParagraphLike {
  getHeight(): number;
}

/** The registered curated fonts; each FontId is registered as its own family name. */
export interface FontSet {
  provider: FontProviderLike;
  families: ReadonlySet<FontId>;
}

export type BlendModeName = 'srcOver' | 'srcATop' | 'screen' | 'softLight' | 'plus';

export interface PaintOptions {
  color?: ColorLike;
  shader?: ShaderLike | null;
  /** 0..1, multiplies the paint colour's alpha. */
  alpha?: number;
  blend?: BlendModeName;
  /** Stroke width; omitted = fill. */
  stroke?: number;
}

export type Point = [number, number];
export type XYWH = [number, number, number, number];

export interface SkiaApi {
  makePaint(opts?: PaintOptions): PaintLike;
  makeRRect(x: number, y: number, w: number, h: number, r: number): RRectLike;
  makeLinearGradient(p0: Point, p1: Point, colors: ColorLike[], positions: number[] | null): ShaderLike;
  makeRadialGradient(c: Point, r: number, colors: ColorLike[], positions: number[] | null): ShaderLike;
  /** Uniform values in declaration order. Effects are compiled once per SkSL string. Null if the shader does not compile. */
  makeRuntimeShader(sksl: string, uniforms: number[]): ShaderLike | null;
  makeImage(bytes: Uint8Array): SkImageLike | null;
  makeFontProvider(): FontProviderLike;
  /** Registers font bytes under `family`; false if the bytes are not a usable font. */
  registerFont(provider: FontProviderLike, bytes: Uint8Array, family: string): boolean;
  /** Lays out `text` (already case-transformed) at `width`; null if the style's font is not in `fonts`. */
  makeParagraph(text: string, style: TextStyle, width: number, fonts: FontSet): ParagraphLike | null;
  colorFromHex(hex: string): ColorLike;
  /** Wraps the library's native canvas. */
  wrapCanvas(native: unknown): CanvasLike;
  /** Frees a native object created through this api (CanvasKit `delete`, RN Skia `dispose`). */
  dispose(obj: unknown): void;
}

export interface CanvasLike {
  save(): void;
  restore(): void;
  /** Offscreen layer composited on restore (with the paint's alpha/blend). */
  saveLayer(paint?: PaintLike): void;
  translate(dx: number, dy: number): void;
  rotate(degrees: number, cx: number, cy: number): void;
  scale(sx: number, sy: number): void;
  clipRRect(rrect: RRectLike): void;
  drawRect(rect: XYWH, paint: PaintLike): void;
  drawRRect(rrect: RRectLike, paint: PaintLike): void;
  drawImageRect(image: SkImageLike, src: XYWH, dst: XYWH, paint: PaintLike): void;
  drawParagraph(paragraph: ParagraphLike, x: number, y: number): void;
}
