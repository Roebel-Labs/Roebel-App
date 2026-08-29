/**
 * Media URL helper for feed/card images.
 *
 * HISTORY: this used to rewrite Supabase public-object URLs to the
 * image-transform (render) endpoint. That endpoint bills per ORIGIN image per
 * billing cycle (Pro plan includes 100), and with every displayed image going
 * through it we blew past the quota (2026-08). Since then:
 *   - every upload path compresses client-side to display size
 *     (≤1600px JPEG, avatars/logos ≤512px — see lib/utils/image-compression.ts)
 *   - existing oversized originals were re-encoded in place server-side
 * so raw storage URLs are already display-sized and the render endpoint is no
 * longer needed. This function now passes URLs through unchanged; it is kept
 * so the many call sites stay untouched and we retain a single choke point if
 * a transform strategy is ever needed again.
 */
export type ImageTransformOptions = {
  width?: number;
  height?: number;
  quality?: number;
};

export function transformedImageUrl(
  url: string | null | undefined,
  _opts: ImageTransformOptions
): string | null {
  return url ?? null;
}
