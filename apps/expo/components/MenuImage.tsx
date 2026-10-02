import React, { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { ShimmerSkeleton } from '@/components/SkeletonLoader';

type Props = {
  /** Full menu photo (menu_items.image_url). */
  uri: string | null | undefined;
  /** Small list copy (menu_items.image_thumb_url); null = only the full image exists. */
  thumbUri?: string | null;
  /** 'thumb' for lists, 'full' for the detail hero (shows the thumb until the full image arrives). */
  size?: 'thumb' | 'full';
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Menu photo with a shimmer placeholder until it has loaded. Lists load the
 * ~40 KB thumbnail instead of the ~250 KB full image; everything is cached on
 * disk so a second visit renders instantly.
 */
export default function MenuImage({ uri, thumbUri, size = 'thumb', borderRadius = 0, style }: Props) {
  const [loaded, setLoaded] = useState(false);
  const source = size === 'thumb' ? thumbUri || uri : uri || thumbUri;
  if (!source) return null;

  return (
    <View style={[{ borderRadius, overflow: 'hidden' }, style]}>
      {!loaded ? (
        <ShimmerSkeleton width={'100%' as any} height={'100%' as any} borderRadius={borderRadius} style={StyleSheet.absoluteFill} />
      ) : null}
      <Image
        source={{ uri: source }}
        placeholder={size === 'full' && thumbUri && thumbUri !== source ? { uri: thumbUri } : undefined}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="memory-disk"
        recyclingKey={source}
        transition={180}
        onLoad={() => setLoaded(true)}
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}

/** Warm the disk cache for a list of menu photos (thumbnails preferred). */
export function prefetchMenuImages(items: { image_url?: string | null; image_thumb_url?: string | null }[]) {
  const urls = items.map((i) => i.image_thumb_url || i.image_url).filter((u): u is string => !!u);
  if (urls.length) Image.prefetch(urls, 'memory-disk').catch(() => {});
}
