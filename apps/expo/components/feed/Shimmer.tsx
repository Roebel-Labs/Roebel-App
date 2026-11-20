/**
 * Legacy names for the skeleton primitives — now the screen-wide top-to-bottom
 * sweep from components/skeleton/Skeleton (one band through all bones).
 */
import React from 'react';
import { type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { Bone, SkeletonScope } from '@/components/skeleton/Skeleton';

export function ShimmerGroup({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <SkeletonScope style={style}>{children}</SkeletonScope>;
}

export function ShimmerBlock({
  style,
  width,
  height,
  radius,
}: {
  style?: StyleProp<ViewStyle>;
  width?: DimensionValue;
  height?: DimensionValue;
  radius?: number;
  /** Accepted for older callers; the bone colour follows the theme. */
  tone?: 'light' | 'dark';
}) {
  return <Bone style={style} width={width} height={height} radius={radius} />;
}
