import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Skeleton } from '@/components/SkeletonLoader';

type Props = {
  imageUrls: string[];
  onPress?: (index: number) => void;
  /** Optional overlay rendered absolutely on top of each cell (e.g., remove buttons). */
  renderOverlay?: (index: number) => React.ReactNode;
  /** Number of pending uploads to render as skeleton placeholders after the existing images. */
  pendingCount?: number;
};

const SINGLE_HEIGHT = 220;
const MULTI_HEIGHT = 240;

export default function PostImageGrid({ imageUrls, onPress, renderOverlay, pendingCount = 0 }: Props) {
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
            source={{ uri: imageUrls[index] }}
            style={styles.fillImage}
            contentFit="cover"
            accessibilityIgnoresInvertColors
          />
        </Pressable>
        {renderOverlay?.(index)}
      </View>
    );
  };

  if (total === 1) {
    return (
      <View style={[styles.container, { height: SINGLE_HEIGHT }]}>
        {renderSlot(0, styles.fill)}
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
