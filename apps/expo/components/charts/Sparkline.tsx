import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/context/ThemeContext';
import { linePath } from '@/lib/charts/geometry';
import { trendColor } from './palette';

/** Tiny trend line for list rows. */
export default function Sparkline({ values, width = 64, height = 24 }: { values: number[]; width?: number; height?: number }) {
  const { isDark } = useTheme();
  const max = Math.max(0, ...values);
  return (
    <Svg width={width} height={height}>
      <Path d={linePath(values, width, height - 2, max)} stroke={trendColor(isDark)} strokeWidth={1.5} fill="none" />
    </Svg>
  );
}
