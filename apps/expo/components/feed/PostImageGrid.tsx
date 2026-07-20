import React, { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Skeleton } from '@/components/SkeletonLoader';
import { transformedImageUrl } from '@/lib/image-url';

type Props = {
  imageUrls: string[];
  onPress?: (index: number) => void;
  /** Optional overlay rendered absolutely on top of each cell (e.g., remove buttons). */
  renderOverlay?: (index: number) => React.ReactNode;
  /** Number of pending uploads to render as skeleton placeholders after the existing images. */
  pendingCount?: number;
};

const MULTI_HEIGHT = 240;

// Single images keep their natural aspect ratio, but never taller than 3:4
// (portrait). aspectRatio is width/height, so the tallest allowed = 3/4 = 0.75.
const MIN_SINGLE_ASPECT = 3 / 4;
// Neutral placeholder ratio used until the real dimensions load.
const DEFAULT_SINGLE_ASPECT = 4 / 5;

export default function PostImageGrid({ imageUrls, onPress, renderOverlay, pendingCount = 0 }: Props) {
  const [singleAspect, setSingleAspect] = useState<number | null>(null);
  const total = imageUrls.length + pendingCount;
  if (total === 0) return null;

  const isPlaceholder = (index: number) => index >= imageUrls.length;

  const renderSlot = (index: number, style: any) => {
    if (isPlaceholder(index)) {
      return (
        <View style={[styles.slot, style]}>
          <Skeleton width="100%" height="100%" borderRadius={0} />
        </View>
      );
    }
    return (
      <View style={[styles.slot, style]}>
        <Pressable onPress={() => onPress?.(index)} style={styles.fill}>
          <Image
            source={{ uri: transformedImageUrl(imageUrls[index], { width: 640 }) ?? undefined }}
            style={styles.fillImage}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={imageUrls[index]}
            accessibilityIgnoresInvertColors
          />
        </Pressable>
        {renderOverlay?.(index)}
      </View>
    );
  };

  if (total === 1) {
    // Adapt to the image's natural ratio, clamped so it's never taller than 3:4.
    const displayAspect = Math.max(singleAspect ?? DEFAULT_SINGLE_ASPECT, MIN_SINGLE_ASPECT);
    return (
      <View style={[styles.container, { aspectRatio: displayAspect }]}>
        {isPlaceholder(0) ? (
          <Skeleton borderRadius={0} style={styles.fillImage} />
        ) : (
          <Pressable onPress={() => onPress?.(0)} style={styles.fill}>
            <Image
              source={{ uri: transformedImageUrl(imageUrls[0], { width: 1080 }) ?? undefined }}
              style={styles.fillImage}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={imageUrls[0]}
              onLoad={(e) => {
                const w = e.source?.width;
                const h = e.source?.height;
                if (w && h) setSingleAspect(w / h);
              }}
              accessibilityIgnoresInvertColors
            />
          </Pressable>
        )}
        {renderOverlay?.(0)}
      </View>
    );
  }

  if (total === 2) {
    return (
      <View style={[styles.container, styles.row, { height: MULTI_HEIGHT }]}>
        {renderSlot(0, styles.flex)}
        {renderSlot(1, styles.flex)}
      </View>
    );
  }

  if (total === 3) {
    return (
      <View style={[styles.container, styles.row, { height: MULTI_HEIGHT }]}>
        {renderSlot(0, styles.flex)}
        <View style={[styles.flex, styles.column]}>
          {renderSlot(1, styles.flex)}
          {renderSlot(2, styles.flex)}
        </View>
      </View>
    );
  }

  // 4 images: 2x2
  return (
    <View style={[styles.container, { height: MULTI_HEIGHT }]}>
      <View style={[styles.row, styles.flex]}>
        {renderSlot(0, styles.flex)}
        {renderSlot(1, styles.flex)}
      </View>
      <View style={[styles.row, styles.flex]}>
        {renderSlot(2, styles.flex)}
        {renderSlot(3, styles.flex)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    gap: 4,
  },
  column: {
    flexDirection: 'column',
    gap: 4,
  },
  fill: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  slot: {
    position: 'relative',
    overflow: 'hidden',
  },
  fillImage: {
    width: '100%',
    height: '100%',
  },
});
