/**
 * Legacy names for the skeleton primitives — now the screen-wide top-to-bottom
 * sweep from components/skeleton/Skeleton (one band through all bones).
 */
import React from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import { Bone, SkeletonScope } from '@/components/skeleton/Skeleton';

export function ShimmerGroup({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <SkeletonScope style={style}>{children}</SkeletonScope>;
}

export function ShimmerBlock({ style }: { style?: StyleProp<ViewStyle> }) {
  return <Bone style={style} />;
}
