import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  height?: number;
  onPress?: () => void;
  pressable?: boolean;
};

export const HERO_HEIGHT = 220;

export default function RoebelCardHero({
  height = HERO_HEIGHT,
  onPress,
  pressable = true,
}: Props) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={pressable ? onPress : undefined}
      disabled={!pressable}
      style={[
        styles.card,
        {
          height,
          backgroundColor: colors.primary,
          shadowColor: '#000',
        },
      ]}
      accessibilityRole={pressable ? 'button' : undefined}
      accessibilityLabel={pressable ? 'Röbel Card öffnen' : undefined}
    >
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: colors.onPrimary }]}>
          Röbel Card
        </Text>
        <Text style={[styles.label, { color: colors.onPrimary }]}>
          Regional ausgeben
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 18,
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    opacity: 0.92,
  },
});
