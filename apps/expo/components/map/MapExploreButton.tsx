/**
 * The "Erkunden" pill in the map's bottom row — the way back to the explore
 * feed. Frosted like the icon buttons beside it; the screen positions it.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import DiscoverStroke from '@/assets/icons/bottom-nav/discover.svg';

import GlassSurface, { glassEdgeColor } from '@/components/GlassSurface';
import PressableScale from '@/components/PressableScale';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { softShadow } from '@/lib/shadow';

export const EXPLORE_BUTTON_HEIGHT = 48;

type Props = {
  onPress: () => void;
};

export default function MapExploreButton({ onPress }: Props) {
  const { colors, isDark } = useTheme();

  return (
    <PressableScale
      onPress={onPress}
      haptic="selection"
      accessibilityRole="button"
      accessibilityLabel="Erkunden öffnen"
      style={[styles.shadow, softShadow(3, isDark)]}
    >
      <View style={[styles.clip, { borderColor: glassEdgeColor(isDark) }]}>
        <GlassSurface />
        <View style={styles.content}>
          <DiscoverStroke width={18} height={18} color={colors.textPrimary} />
          <Text style={[styles.label, { color: colors.textPrimary }]}>Erkunden</Text>
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  shadow: { borderRadius: EXPLORE_BUTTON_HEIGHT / 2 },
  clip: {
    height: EXPLORE_BUTTON_HEIGHT,
    borderRadius: EXPLORE_BUTTON_HEIGHT / 2,
    borderWidth: 1,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 22,
  },
  label: { fontSize: 14, fontFamily: fontFamily.semiBold },
});
