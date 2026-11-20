// One shared CanvasKit instance for every card canvas in Studio: the wasm, the curated fonts and the
// decoded images are loaded once. Drawing itself is @roebel/card-design's drawDesign.
import type { CanvasKit, Surface } from 'canvaskit-wasm';
import { FONT_FILES, isBuiltinAsset, loadFontSet, type CardDesign, type FontSet, type SkiaApi, type SkImageLike } from '@roebel/card-design';
import { createCanvasKitApi, loadCanvasKit, renderPng } from '@roebel/card-design/canvaskit';
import wasmUrl from 'canvaskit-wasm/bin/canvaskit.wasm?url';
import { apiBase } from '../../workspace/session';
import { BUILTIN_URLS, FONT_URLS } from './files';

export interface Skia {
  ck: CanvasKit;
  api: SkiaApi;
  fonts: FontSet;
}

export type ShineMode = 'loop' | 'pointer' | 'static';

/** WebGL surface on the canvas, else CanvasKit's software surface (no blank canvas without WebGL). */
export function makeSurface(ck: CanvasKit, canvas: HTMLCanvasElement): Surface | null {
  let gl: Surface | null = null;
  try {
    gl = ck.MakeWebGLCanvasSurface(canvas);
  } catch {
    gl = null;
  }
  return gl ?? ck.MakeSWCanvasSurface(canvas);
}

/** Bundled files load from file:// in the desktop app, where fetch() refuses the scheme; XHR reads them. */
function xhrBytes(url: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('GET', url);
    x.responseType = 'arraybuffer';
    x.onload = () => (x.response ? resolve(new Uint8Array(x.response as ArrayBuffer)) : reject(new Error('empty')));
    x.onerror = () => reject(new Error(`cannot read ${url}`));
    x.send();
  });
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  let local = false;
  try {
    local = new URL(url, globalThis.location?.href).protocol === 'file:';
  } catch {
    local = false;
  }
  if (local) return xhrBytes(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Loader that resolves once and is retried after a failure. Injected parts keep it testable. */
export function createSkiaLoader(
  loadCk: () => Promise<CanvasKit>,
  loadFonts: (api: SkiaApi) => Promise<FontSet>,
  makeApi: (ck: CanvasKit) => SkiaApi = createCanvasKitApi,
): () => Promise<Skia> {
  let shared: Promise<Skia> | null = null;
  return () => {
    if (!shared) {
      shared = (async () => {
        const ck = await loadCk();
        const api = makeApi(ck);
        return { ck, api, fonts: await loadFonts(api) };
      })();
      shared.catch(() => {
        shared = null;
      });
    }
    return shared;
  };
}

export const loadSkia = createSkiaLoader(
  () => loadCanvasKit({ locateFile: () => wasmUrl }),
  (api) => loadFontSet(api, (file) => fetchBytes(FONT_URLS[file] ?? FONT_URLS[FONT_FILES.mona])),
);

// ---- images ------------------------------------------------------------------------------

const images = new Map<string, Promise<SkImageLike | null>>();

/** Where an asset's bytes live: bundled built-in art, or the org's uploaded image on the server. */
export function assetSource(id: string, known?: string): string | null {
  if (known) return known;
  if (isBuiltinAsset(id)) return BUILTIN_URLS[id] ?? null; // the logo slot has no art
  return /^[0-9a-f]{64}$/.test(id) ? `${apiBase()}/api/credentials/designs/assets/${id}` : null;
}

/** Decoded image of an asset (cached for the session); null when it cannot be loaded. */
export function loadAssetImage(skia: Skia, id: string, url?: string): Promise<SkImageLike | null> {
  let p = images.get(id);
  if (!p) {
    const src = assetSource(id, url);
    p = src ? fetchBytes(src).then((b) => skia.api.makeImage(b), () => null) : Promise.resolve(null);
    images.set(id, p);
    // A failed fetch may work later (network); do not cache the miss.
    void p.then((img) => {
      if (!img) images.delete(id);
    });
  }
  return p;
}

/** Asset ids a design draws. */
export function designAssets(d: CardDesign): string[] {
  const ids = new Set<string>();
  if (d.background.kind === 'image') ids.add(d.background.assetId);
  for (const l of d.layers) if (l.type === 'image') ids.add(l.assetId);
  return [...ids];
}

/** All images of a design (missing ones are left out; drawDesign skips them). */
export async function imagesFor(skia: Skia, d: CardDesign, urls: Record<string, string> = {}): Promise<Map<string, SkImageLike>> {
  const out = new Map<string, SkImageLike>();
  await Promise.all(
    designAssets(d).map(async (id) => {
      const img = await loadAssetImage(skia, id, urls[id]);
      if (img) out.set(id, img);
    }),
  );
  return out;
}

/** A still PNG of the design as an object URL (template tiles, wallet stack). */
export async function snapshotUrl(skia: Skia, design: CardDesign, width: number, values?: Record<string, string>): Promise<string> {
  const png = await renderPng(design, { ck: skia.ck, fonts: skia.fonts, images: await imagesFor(skia, design), width, mode: 'preview', values, shinePhase: 0.35 });
  return URL.createObjectURL(new Blob([png as BlobPart], { type: 'image/png' }));
}

// ---- motion ------------------------------------------------------------------------------

export function hasShine(d: CardDesign): boolean {
  return (d.shine.enabled && d.shine.intensity > 0) || d.layers.some((l) => l.shine);
}

/** Redraw every frame only while there is a sheen to move. */
export function shouldAnimate(d: CardDesign, mode: ShineMode, reducedMotion: boolean): boolean {
  return mode !== 'static' && !reducedMotion && hasShine(d);
}

/** Phase 0..1 of the slow sheen loop (one pass every `periodMs`, then a pause). */
export function loopPhase(nowMs: number, periodMs = 4200): number {
  const p = (nowMs % periodMs) / periodMs;
  return Math.min(1, p / 0.7);
}

/** Pointer position over the card → tilt, each axis -1..1. */
export function tiltFromPointer(rect: { left: number; top: number; width: number; height: number }, x: number, y: number): { x: number; y: number } {
  const c = (v: number) => Math.max(-1, Math.min(1, v));
  return { x: c(((x - rect.left) / rect.width) * 2 - 1), y: c(((y - rect.top) / rect.height) * 2 - 1) };
}

export function prefersReducedMotion(): boolean {
  try {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}
