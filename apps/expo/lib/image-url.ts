/**
 * Rewrites Supabase Storage public-object URLs to the image-transform
 * (render) endpoint so feed images download at display size instead of the
 * full-resolution original (Pro-plan feature). Non-Supabase URLs, videos,
 * gifs and svgs pass through untouched, so callers can apply this to any
 * media URL unconditionally.
 */
const OBJECT_PUBLIC = '/storage/v1/object/public/';
const RENDER_PUBLIC = '/storage/v1/render/image/public/';
const SKIP_EXTENSIONS = /\.(mp4|mov|webm|m3u8|gif|svg)(\?|$)/i;

export type ImageTransformOptions = {
  width?: number;
  height?: number;
  quality?: number;
};

export function transformedImageUrl(
  url: string | null | undefined,
  opts: ImageTransformOptions
): string | null {
  if (!url) return null;
  if (!url.includes(OBJECT_PUBLIC)) return url;
  if (SKIP_EXTENSIONS.test(url)) return url;

  const [base, existingQuery] = url.split('?');
  const params = new URLSearchParams(existingQuery ?? '');
  if (opts.width) params.set('width', String(Math.round(opts.width)));
  if (opts.height) params.set('height', String(Math.round(opts.height)));
  params.set('quality', String(opts.quality ?? 75));
  params.set('resize', 'cover');

  return `${base.replace(OBJECT_PUBLIC, RENDER_PUBLIC)}?${params.toString()}`;
}
