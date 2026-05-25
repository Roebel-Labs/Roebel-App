/**
 * Extract YouTube video ID from various URL formats:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://www.youtube.com/live/VIDEO_ID
 */
export function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return null;
}

/**
 * Find the first YouTube URL inside an arbitrary block of text. Returns the
 * original token (preserving query params like `?t=` timestamps), or null.
 */
export function findYouTubeUrl(text: string | null | undefined): string | null {
  if (!text) return null;
  for (const token of text.split(/\s+/)) {
    if (extractYouTubeVideoId(token)) return token;
  }
  return null;
}

/**
 * Remove any YouTube URL tokens from a block of text (used to hide the raw
 * link on posts that already render an inline YouTube preview). Returns the
 * trimmed remainder, which may be an empty string.
 */
export function removeYouTubeUrls(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .split(/(\s+)/)
    .filter((token) => !extractYouTubeVideoId(token))
    .join('')
    .trim();
}

/**
 * Resolve the YouTube URL for a post: prefer a YouTube URL among the
 * server-side link records, otherwise scan the post body. Returns null when
 * the post has no YouTube link.
 */
export function resolveYouTubeUrl(
  content: string | null | undefined,
  linkUrls?: (string | null | undefined)[]
): string | null {
  const fromLinks = linkUrls?.find((url) => url && extractYouTubeVideoId(url));
  if (fromLinks) return fromLinks;
  return findYouTubeUrl(content);
}

/** Full-resolution thumbnail URL for a YouTube video id. */
export function getYouTubeThumbnail(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
}

/** Reliable fallback thumbnail (always present, even for old/low-res videos). */
export function getYouTubeThumbnailFallback(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}