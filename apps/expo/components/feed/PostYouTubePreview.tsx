import React from 'react';
import YouTubeEmbed from '@/components/YouTubeEmbed';
import { extractYouTubeVideoId } from '@/lib/utils/youtube';

const PLAYER_HEIGHT = 200;

type Props = {
  youtubeUrl: string;
};

/**
 * Inline YouTube preview for posts — renders the actual player immediately so
 * the video can be watched in place. The player's WebView owns its own touches
 * (no responder wrapper, which would swallow taps); callers must render this
 * OUTSIDE any navigating Pressable so a tap plays instead of navigating.
 */
export default function PostYouTubePreview({ youtubeUrl }: Props) {
  const videoId = extractYouTubeVideoId(youtubeUrl);
  if (!videoId) return null;

  return <YouTubeEmbed youtubeUrl={youtubeUrl} height={PLAYER_HEIGHT} autoplay={false} />;
}
