// Server rendering of the public preview PNG of a card design (metadata `image`, link previews,
// the web dashboard). Always `mode: 'public'`: no personal field is ever drawn, whatever the
// design holds.
//
// The package's own Node loaders resolve files from `import.meta.url`, which a Next server bundle
// rewrites to the build machine's path. So this module resolves canvaskit.wasm, the fonts and the
// built-in art from the installed packages at runtime (next.config.mjs traces those files into
// the design routes).
// Relative imports only: loaded by `npx tsx --test`.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import CanvasKitInit from "canvaskit-wasm";
import type { CanvasKit } from "canvaskit-wasm";
import { BUILTIN_ASSETS, isBuiltinAsset, loadFontSet, type CardDesign, type FontSet, type SkImageLike } from "@roebel/card-design";
import { createCanvasKitApi, renderPng } from "@roebel/card-design/canvaskit";
import { assetIdsOf } from "./drafts";

export const PREVIEW_WIDTH = 924;
export const PREVIEW_SHINE_PHASE = 0.35;

/** Bytes of a non-built-in asset id, or null when it cannot be loaded (the layer is skipped). */
export type AssetLoader = (assetId: string) => Promise<Uint8Array | null>;

const appRequire = () => createRequire(path.join(process.cwd(), "package.json"));

let root: string | null = null;
/**
 * Root of the @roebel/card-design package files (fonts/, assets/). The workspace path relative
 * to apps/web is what the Vercel trace ships; the node_modules link covers other layouts.
 */
function cardDesignRoot(): string {
  if (root) return root;
  const candidates = [path.resolve(process.cwd(), "../../packages/card-design"), path.resolve(process.cwd(), "node_modules/@roebel/card-design")];
  try {
    candidates.push(path.resolve(path.dirname(appRequire().resolve("@roebel/card-design")), ".."));
  } catch {
    /* not resolvable from here */
  }
  const hit = candidates.find((c) => existsSync(path.join(c, "fonts")));
  if (!hit) throw new Error("card-design files not found");
  root = hit;
  return hit;
}

let ckPromise: Promise<CanvasKit> | null = null;
function canvasKit(): Promise<CanvasKit> {
  if (!ckPromise) {
    const wasm = appRequire().resolve("canvaskit-wasm/bin/canvaskit.wasm");
    ckPromise = CanvasKitInit({ locateFile: (file: string) => path.join(path.dirname(wasm), file) });
    ckPromise.catch(() => {
      ckPromise = null;
    });
  }
  return ckPromise;
}

let fontsPromise: Promise<FontSet> | null = null;
function fonts(ck: CanvasKit): Promise<FontSet> {
  if (!fontsPromise) {
    const dir = path.join(cardDesignRoot(), "fonts");
    fontsPromise = loadFontSet(createCanvasKitApi(ck), async (file) => new Uint8Array(await readFile(path.join(dir, file))));
    fontsPromise.catch(() => {
      fontsPromise = null;
    });
  }
  return fontsPromise;
}

async function builtinBytes(id: string): Promise<Uint8Array | null> {
  const rel = BUILTIN_ASSETS[id];
  if (!rel) return null; // e.g. the art-less logo slot
  return new Uint8Array(await readFile(path.join(cardDesignRoot(), rel)));
}

/** The public preview PNG (924 px wide, sheen at 0.35, personal fields empty). */
export async function renderPreview(design: CardDesign, images: AssetLoader): Promise<Uint8Array> {
  const ck = await canvasKit();
  const api = createCanvasKitApi(ck);
  const decoded = new Map<string, SkImageLike>();
  try {
    for (const id of assetIdsOf(design)) {
      const bytes = isBuiltinAsset(id) ? await builtinBytes(id) : await images(id).catch(() => null);
      if (!bytes) continue;
      const img = api.makeImage(bytes);
      if (img) decoded.set(id, img);
    }
    return await renderPng(design, {
      ck,
      fonts: await fonts(ck),
      images: decoded,
      width: PREVIEW_WIDTH,
      mode: "public",
      shinePhase: PREVIEW_SHINE_PHASE,
    });
  } finally {
    for (const img of decoded.values()) api.dispose(img);
  }
}
