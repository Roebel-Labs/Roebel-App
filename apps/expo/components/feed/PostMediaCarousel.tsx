import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  Text,
  StyleSheet,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { Skeleton } from '@/components/SkeletonLoader';
import { transformedImageUrl } from '@/lib/image-url';
import type { PostMediaItem } from '@/lib/utils/post-media';
import PostVideoPlayer from './PostVideoPlayer';
import { useRailLockTouchHandlers } from './HorizontalRailLock';

export type PendingMedia = { key: string; type: 'image' | 'video'; label?: string };

type Props = {
  items: PostMediaItem[];
  /** Uploads still running — rendered as skeleton slides after the items. */
  pending?: PendingMedia[];
  /** Whether the surrounding card is on screen (gates video playback). */
  isVisible?: boolean;
  autoPlay?: boolean;
  startUnmuted?: boolean;
  onPressImage?: (url: string) => void;
  /** Optional overlay per slide (e.g. a remove button in the composer). */
  renderOverlay?: (index: number) => React.ReactNode;
  /**
   * How far the slider may run past its column on each side — normally the
   * parent's horizontal padding (+ the avatar rail on the left). Slides then
   * swipe all the way to the screen edge instead of being cut at the column,
   * while the first slide still lines up with the post text.
   */
  bleedLeft?: number;
  bleedRight?: number;
  height?: number;
};

const GAP = 6;
const DEFAULT_HEIGHT = 300;
const DEFAULT_ASPECT = 4 / 5;
// Tallest slide = 9:16 (phone video); widest is capped by the column width.
const MIN_ASPECT = 9 / 16;
// A slide never fills the whole column, so the next one always peeks in.
const MAX_COLUMN_FRACTION = 0.86;

function PostMediaCarousel({
  items,
  pending = [],
  isVisible = true,
  autoPlay = true,
  startUnmuted = false,
  onPressImage,
  renderOverlay,
  bleedLeft = 0,
  bleedRight = 0,
  height = DEFAULT_HEIGHT,
}: Readonly<Props>) {
  const [outerWidth, setOuterWidth] = useState(0);
  const [aspects, setAspects] = useState<Record<string, number>>({});
  const [activeIndex, setActiveIndex] = useState(0);
  // In the Austausch feed: locks the tab pager while a finger is on the
  // slider, so swiping through media never flips the tab (e.g. to Umfragen).
  const railLockHandlers = useRailLockTouchHandlers();

  const columnWidth = Math.max(0, outerWidth - bleedLeft - bleedRight);
  const maxSlideWidth = columnWidth > 0 ? columnWidth * MAX_COLUMN_FRACTION : height;

  const setAspect = useCallback((url: string, ratio: number) => {
    if (!Number.isFinite(ratio) || ratio <= 0) return;
    setAspects((prev) => (Math.abs((prev[url] ?? 0) - ratio) < 0.01 ? prev : { ...prev, [url]: ratio }));
  }, []);

  const slideWidth = useCallback(
    (aspect: number) => Math.round(Math.min(Math.max(aspect, MIN_ASPECT) * height, maxSlideWidth)),
    [height, maxSlideWidth],
  );

  const widths = useMemo(
    () => [
      ...items.map((m) => slideWidth(aspects[m.url] ?? DEFAULT_ASPECT)),
      ...pending.map(() => slideWidth(DEFAULT_ASPECT)),
    ],
    [items, pending, aspects, slideWidth],
  );

  // Each slide snaps to the column's left edge.
  const snapOffsets = useMemo(() => {
    const offsets: number[] = [];
    let x = 0;
    for (const w of widths) {
      offsets.push(x);
      x += w + GAP;
    }
    return offsets;
  }, [widths]);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      let nearest = 0;
      for (let i = 1; i < snapOffsets.length; i++) {
        if (Math.abs(snapOffsets[i] - x) < Math.abs(snapOffsets[nearest] - x)) nearest = i;
      }
      setActiveIndex((prev) => (prev === nearest ? prev : nearest));
    },
    [snapOffsets],
  );

  const total = items.length + pending.length;
  if (total === 0) return null;

  return (
    <View
      style={{ marginLeft: -bleedLeft, marginRight: -bleedRight }}
      onLayout={(e: LayoutChangeEvent) => setOuterWidth(e.nativeEvent.layout.width)}
    >
      <ScrollView
        horizontal
        {...railLockHandlers}
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToOffsets={snapOffsets}
        snapToEnd={false}
        disableIntervalMomentum
        onScroll={handleScroll}
        scrollEventThrottle={32}
        contentContainerStyle={[
          styles.content,
          { paddingLeft: bleedLeft, paddingRight: bleedRight, height },
        ]}
      >
        {items.map((item, i) => (
          <View key={`${item.url}-${i}`} style={[styles.slide, { width: widths[i], height }]}>
            {item.type === 'video' ? (
              <PostVideoPlayer
                videoUrl={item.url}
                fill
                isVisible={isVisible && activeIndex === i}
                autoPlay={autoPlay}
                startUnmuted={startUnmuted}
                onAspectRatio={(r) => setAspect(item.url, r)}
              />
            ) : (
              <Pressable style={styles.fill} onPress={() => onPressImage?.(item.url)}>
                <Image
                  source={{ uri: transformedImageUrl(item.url, { width: 720 }) ?? undefined }}
                  style={styles.fill}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  recyclingKey={item.url}
                  onLoad={(e) => {
                    const { width: w, height: h } = e.source ?? {};
                    if (w && h) setAspect(item.url, w / h);
                  }}
                  accessibilityIgnoresInvertColors
                />
              </Pressable>
            )}
            {/* The composer's remove button sits where the counter would. */}
            {total > 1 && !renderOverlay && (
              <View pointerEvents="none" style={styles.counter}>
                <Text style={styles.counterText}>
                  {i + 1}/{total}
                </Text>
              </View>
            )}
            {renderOverlay?.(i)}
          </View>
        ))}
        {pending.map((p, j) => (
          <View
            key={p.key}
            style={[styles.slide, { width: widths[items.length + j], height }]}
          >
            <Skeleton width="100%" height="100%" borderRadius={0} />
            {p.label ? (
              <View pointerEvents="none" style={styles.pendingLabel}>
                <Text style={styles.counterText}>{p.label}</Text>
              </View>
            ) : null}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

export default React.memo(PostMediaCarousel);

const styles = StyleSheet.create({
  content: {
    gap: GAP,
  },
  slide: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
    position: 'relative',
  },
  fill: {
    width: '100%',
    height: '100%',
  },
  counter: {
    position: 'absolute',
    top: 10,
    left: 10,
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 11,
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  counterText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: 'MonaSans-SemiBold',
  },
  pendingLabel: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 11,
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
});
