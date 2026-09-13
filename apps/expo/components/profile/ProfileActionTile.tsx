import React, { useState } from 'react';
import { Image, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import PressableScale from '@/components/PressableScale';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  label: string;
  image: ImageSourcePropType;
  onPress: () => void;
};

export const TILE_SIZE = 64;
export const TILE_RADIUS = 18;
const TILE_LIGHT = '#F2F3F5';
const TILE_LIGHT_PRESSED = '#E6E8EB';

/** Illustration inside a rounded gray square, label underneath. */
export default function ProfileActionTile({ label, image, onPress }: Props) {
  const { colors, isDark } = useTheme();
  const [pressed, setPressed] = useState(false);
  const idle = isDark ? colors.surfaceSecondary : TILE_LIGHT;
  const active = isDark ? colors.surface : TILE_LIGHT_PRESSED;

  return (
    <PressableScale
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      haptic="selection"
      accessibilityRole="button"
      accessibilityLabel={label.replace('\n', ' ').replace('- ', '')}
      style={styles.cell}
    >
      <View style={[styles.square, { backgroundColor: pressed ? active : idle }]}>
        <Image source={image} style={styles.image} resizeMode="contain" />
      </View>
      <Text style={[styles.label, { color: colors.textPrimary }]} numberOfLines={2}>
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  cell: {
    width: '33.333%',
    alignItems: 'center',
    paddingHorizontal: 4,
    gap: 8,
  },
  square: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: TILE_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: 48,
    height: 48,
  },
  label: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    lineHeight: 15,
    textAlign: 'center',
  },
});
