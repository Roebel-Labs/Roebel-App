/**
 * Round frosted icon button for the map's floating controls (back, SOS,
 * search, locate). Same material as GlassPill: the outer pressable carries
 * the shadow, the inner view clips the glass to the circle. Not an Android
 * blur sampler — the map has none (see MapBottomFade); Android gets the
 * tinted fill GlassSurface falls back to.
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import GlassSurface, { glassEdgeColor } from '@/components/GlassSurface';
import PressableScale from '@/components/PressableScale';
import { useTheme } from '@/context/ThemeContext';
import { softShadow } from '@/lib/shadow';

export const MAP_ICON_BUTTON_SIZE = 48;

type Props = {
  onPress: () => void;
  accessibilityLabel: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export default function MapIconButton({ onPress, accessibilityLabel, children, style }: Props) {
  const { isDark } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      haptic="selection"
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[styles.shadow, softShadow(2, isDark), style]}
    >
      <View style={[styles.clip, { borderColor: glassEdgeColor(isDark) }]}>
        <GlassSurface />
        <View style={styles.content}>{children}</View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  shadow: { borderRadius: MAP_ICON_BUTTON_SIZE / 2 },
  clip: {
    width: MAP_ICON_BUTTON_SIZE,
    height: MAP_ICON_BUTTON_SIZE,
    borderRadius: MAP_ICON_BUTTON_SIZE / 2,
    borderWidth: 1,
    overflow: 'hidden',
  },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
