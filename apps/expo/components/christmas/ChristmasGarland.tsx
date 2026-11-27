import React from 'react';
import { StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import Garland from '@/assets/illustration/christmas/garland.svg';
import { useChristmasSeason } from '@/lib/christmas';

const RATIO = 70 / 1024; // viewBox of garland.svg

type Props = {
  style?: StyleProp<ViewStyle>;
  /** Render outside the season too (the support screen always shows it). */
  always?: boolean;
};

/** Edge-to-edge Christmas garland strip. Renders nothing outside the season. */
export default function ChristmasGarland({ style, always }: Props) {
  const season = useChristmasSeason();
  const { width } = useWindowDimensions();
  if (!season && !always) return null;
  return (
    <View style={[styles.wrap, { height: Math.round(width * RATIO) }, style]} pointerEvents="none" accessible={false}>
      <Garland width={width} height={Math.round(width * RATIO)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', overflow: 'hidden' },
});
