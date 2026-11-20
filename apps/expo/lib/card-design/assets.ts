// Images of a card design: built-in art from the bundle, org images (sha256 ids) from
// GET /api/credentials/designs/assets/<sha> with an on-disk cache (content-addressed, so a cached
// file never goes stale). A failed image is left out of the map — the card draws without that
// layer — and is tried again on the next `retryKey` change (e.g. the next screen focus).
import { useEffect, useMemo, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { Skia, type SkImage } from '@shopify/react-native-skia';
import { LOGO_SLOT_ASSET, type CardDesign, type SkImageLike } from '@roebel/card-design';
import { getApiBaseUrl } from '@/lib/signed-request';
import { BUILTIN_MODULES, moduleUri } from './skia';

const SHA_RE = /^[0-9a-f]{64}$/;

/** Every image id a design uses (background and image layers), without the empty logo slot. */
export function designAssetIds(design: CardDesign): string[] {
  const ids = new Set<string>();
  if (design.background.kind === 'image') ids.add(design.background.assetId);
  for (const l of design.layers) if (l.type === 'image') ids.add(l.assetId);
  ids.delete(LOGO_SLOT_ASSET);
  return [...ids];
}

export const designAssetUrl = (sha: string) => `${getApiBaseUrl()}/api/credentials/designs/assets/${sha}`;

const CACHE_DIR = `${FileSystem.cacheDirectory ?? ''}card-assets/`;

/** Local file of an org image, downloaded once. Throws when it cannot be fetched. */
async function cachedFile(sha: string): Promise<string> {
  const file = `${CACHE_DIR}${sha}`;
  const info = await FileSystem.getInfoAsync(file);
  if (info.exists && (info as { size?: number }).size) return file;
  await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true }).catch(() => undefined);
  const tmp = `${file}.part`;
  const res = await FileSystem.downloadAsync(designAssetUrl(sha), tmp);
  if (res.status !== 200) {
    await FileSystem.deleteAsync(tmp, { idempotent: true }).catch(() => undefined);
    throw new Error(`asset ${sha.slice(0, 8)}: HTTP ${res.status}`);
  }
  await FileSystem.moveAsync({ from: tmp, to: file });
  return file;
}

export type ImageSource = (id: string) => Promise<SkImageLike | null>;

/** The app's source: bundled built-ins, cached org images. Unknown ids → null. */
export const appImageSource: ImageSource = async (id) => {
  let uri: string | null = null;
  if (id in BUILTIN_MODULES) uri = moduleUri(BUILTIN_MODULES[id]);
  else if (SHA_RE.test(id)) uri = await cachedFile(id);
  if (!uri) return null;
  return Skia.Image.MakeImageFromEncoded(await Skia.Data.fromURI(uri)) as SkImage | null;
};

/** Decoded images shared by every card on screen (a wallet shows the same art many times). */
const decoded = new Map<string, SkImageLike>();

/** Resolves `ids` into `decoded`; failures are swallowed (and retried by the next call). */
export async function loadImages(ids: string[], source: ImageSource = appImageSource): Promise<Map<string, SkImageLike>> {
  await Promise.all(
    ids.filter((id) => !decoded.has(id)).map(async (id) => {
      try {
        const img = await source(id);
        if (img) decoded.set(id, img);
      } catch {
        // Offline or broken: draw without it, retry later.
      }
    }),
  );
  const out = new Map<string, SkImageLike>();
  for (const id of ids) {
    const img = decoded.get(id);
    if (img) out.set(id, img);
  }
  return out;
}

/** Test hook: forget decoded images. */
export function clearDecodedImages(): void {
  decoded.clear();
}

/** The design's images that are loaded so far; missing ones are retried when `retryKey` changes. */
export function useDesignImages(design: CardDesign | null, retryKey: unknown = 0, source: ImageSource = appImageSource): Map<string, SkImageLike> {
  const ids = useMemo(() => (design ? designAssetIds(design) : []), [design]);
  const key = ids.join('|');
  const [images, setImages] = useState<Map<string, SkImageLike>>(() => {
    const m = new Map<string, SkImageLike>();
    for (const id of ids) { const img = decoded.get(id); if (img) m.set(id, img); }
    return m;
  });
  useEffect(() => {
    let alive = true;
    if (ids.length === 0) {
      setImages((prev) => (prev.size === 0 ? prev : new Map()));
      return;
    }
    loadImages(ids, source).then((m) => {
      if (!alive) return;
      setImages((prev) => (sameMap(prev, m) ? prev : m));
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, retryKey, source]);
  return images;
}

function sameMap(a: Map<string, SkImageLike>, b: Map<string, SkImageLike>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}
