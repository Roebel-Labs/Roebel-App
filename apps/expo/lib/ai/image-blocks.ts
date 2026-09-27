// Image content blocks for Anthropic Messages requests sent through the web proxy.
//
// The proxy runs on Vercel, whose functions accept at most 4.5 MB per request body. Resending
// every flyer as base64 on every turn (the pre-proxy behaviour) can exceed that after two or
// three images, so images that are already uploaded to our public `images` bucket go as URL
// sources (Anthropic fetches them). Only images without a public URL fall back to base64.

export type ImageBlock =
  | { type: 'image'; source: { type: 'url'; url: string } }
  | {
      type: 'image';
      source: { type: 'base64'; media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'; data: string };
    };

export function isPublicHttpsUrl(u: string | null | undefined): u is string {
  return typeof u === 'string' && /^https:\/\//i.test(u);
}

/**
 * Builds the image blocks for one message. `remoteUrls` wins when every entry is a public https
 * URL; otherwise `toBase64` is called for each local URI (null results are skipped).
 */
export async function buildImageBlocks(
  remoteUrls: readonly (string | null | undefined)[] | undefined,
  localUris: readonly string[] | undefined,
  toBase64: (uri: string) => Promise<{ base64: string; mediaType: string } | null>,
): Promise<ImageBlock[]> {
  const remote = (remoteUrls ?? []).filter((u): u is string => !!u);
  if (remote.length > 0 && remote.every(isPublicHttpsUrl)) {
    return remote.map((url) => ({ type: 'image' as const, source: { type: 'url' as const, url } }));
  }
  const locals = localUris && localUris.length > 0 ? localUris : remote;
  const images = (await Promise.all(locals.map((u) => toBase64(u)))).filter(
    (img): img is { base64: string; mediaType: string } => img !== null,
  );
  return images.map((img) => ({
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: img.mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
      data: img.base64,
    },
  }));
}
