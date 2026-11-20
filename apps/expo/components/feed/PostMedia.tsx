import React from 'react';
import type { PostMediaItem } from '@/lib/utils/post-media';
import PostImageGrid from './PostImageGrid';
import PostVideoPlayer from './PostVideoPlayer';
import PostMediaCarousel, { type PendingMedia } from './PostMediaCarousel';

type Props = {
  items: PostMediaItem[];
  pending?: PendingMedia[];
  isVisible?: boolean;
  autoPlay?: boolean;
  startUnmuted?: boolean;
  onPressImage?: (url: string) => void;
  renderOverlay?: (index: number) => React.ReactNode;
  /** Passed to the slider — see PostMediaCarousel. */
  bleedLeft?: number;
  bleedRight?: number;
};

const MAX_GRID_IMAGES = 4;

/**
 * Picks the layout for a post's media:
 * - one video → the full-width player (as before)
 * - up to 4 images, no video → the existing image grid
 * - anything mixed with a video, or more than 4 items → horizontal slider
 */
export default function PostMedia({
  items,
  pending = [],
  isVisible = true,
  autoPlay = true,
  startUnmuted = false,
  onPressImage,
  renderOverlay,
  bleedLeft,
  bleedRight,
}: Readonly<Props>) {
  const total = items.length + pending.length;
  if (total === 0) return null;

  const anyVideo = items.some((m) => m.type === 'video') || pending.some((p) => p.type === 'video');

  if (items.length === 1 && pending.length === 0 && items[0].type === 'video' && !renderOverlay) {
    return (
      <PostVideoPlayer
        videoUrl={items[0].url}
        isVisible={isVisible}
        autoPlay={autoPlay}
        startUnmuted={startUnmuted}
      />
    );
  }

  if (!anyVideo && total <= MAX_GRID_IMAGES) {
    const urls = items.map((m) => m.url);
    return (
      <PostImageGrid
        imageUrls={urls}
        pendingCount={pending.length}
        onPress={(i) => onPressImage?.(urls[i])}
        renderOverlay={renderOverlay}
      />
    );
  }

  return (
    <PostMediaCarousel
      items={items}
      pending={pending}
      isVisible={isVisible}
      autoPlay={autoPlay}
      startUnmuted={startUnmuted}
      onPressImage={onPressImage}
      renderOverlay={renderOverlay}
      bleedLeft={bleedLeft}
      bleedRight={bleedRight}
    />
  );
}
