/**
 * Mixed post media (images + videos in one post, in the author's order).
 *
 * Storage: every item lives in `posts.media_urls`, in order. Videos are told
 * apart by URL (file extension or the Cloudflare Stream host). `video_url`
 * still carries the FIRST video so older app builds keep playing it; new
 * clients merge it back in and drop the duplicate.
 */

export type PostMediaItem = { type: 'image' | 'video'; url: string };

const VIDEO_EXT = /\.(mp4|mov|m4v|webm|m3u8)(\?|#|$)/i;
const VIDEO_HOSTS = /(videodelivery\.net|cloudflarestream\.com)/i;

export function isVideoUrl(url: string): boolean {
  return VIDEO_EXT.test(url) || VIDEO_HOSTS.test(url);
}

export function getPostMedia(post: {
  media_urls?: (string | null)[] | null;
  video_url?: string | null;
}): PostMediaItem[] {
  const urls = (post.media_urls ?? []).filter((u): u is string => !!u);
  const items: PostMediaItem[] = urls.map((url) => ({
    type: isVideoUrl(url) ? 'video' : 'image',
    url,
  }));
  if (post.video_url && !urls.includes(post.video_url)) {
    items.push({ type: 'video', url: post.video_url });
  }
  return items;
}

export function hasPostVideo(post: {
  media_urls?: (string | null)[] | null;
  video_url?: string | null;
}): boolean {
  return getPostMedia(post).some((m) => m.type === 'video');
}

/** Columns for createPost: ordered media list + first video for old builds. */
export function mediaToPostColumns(items: PostMediaItem[]): {
  media_urls?: string[];
  video_url?: string;
} {
  if (items.length === 0) return {};
  const firstVideo = items.find((m) => m.type === 'video')?.url;
  // A lone video keeps the legacy shape (video_url only) so nothing changes
  // for posts every client already understands.
  if (items.length === 1 && firstVideo) return { video_url: firstVideo };
  return { media_urls: items.map((m) => m.url), video_url: firstVideo };
}
