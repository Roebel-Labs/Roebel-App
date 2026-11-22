import React from 'react';
import Svg, { Path } from 'react-native-svg';

/** Elli's green: darker for white text on it, lighter for the leaf. */
export const ELLI_GREEN = '#3E9B3A';
export const ELLI_GREEN_LIGHT = '#5DBB46';

export function LeafIcon({ size = 28, color = ELLI_GREEN_LIGHT }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M20.5 3.5C11 3.5 5 8 5 14.2c0 1.6.4 3 1.1 4.1L3.5 21l1.4 1.4 2.7-2.7c1.1.7 2.5 1.1 4.1 1.1 6.2 0 9.8-6.5 8.8-17.3Z" fill={color} />
      <Path d="M7.8 18.4c2.5-4.4 5.7-7.5 9.4-9.6" stroke="#000" strokeOpacity={0.35} strokeWidth={1.4} fill="none" strokeLinecap="round" />
    </Svg>
  );
}
