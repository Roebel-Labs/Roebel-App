import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import {
  RARITY_COLOR,
  RARITY_LABEL,
  RARITY_ICON,
} from '@/lib/rarity';
import type { LootboxRewardRarity } from '@/lib/supabase-rewards';

type Props = {
  rarity: LootboxRewardRarity;
  size?: 'small' | 'medium';
};

export default function RarityPill({ rarity, size = 'small' }: Props) {
  const { isDark } = useTheme();
  const color = RARITY_COLOR[rarity];
  const iconName = RARITY_ICON[rarity];
  const bg = color + (isDark ? '33' : '1F');
  const isMedium = size === 'medium';

  return (
    <View
      style={[
        styles.pill,
        isMedium ? styles.pillMedium : styles.pillSmall,
        { backgroundColor: bg },
      ]}
      accessibilityLabel={`Seltenheit: ${RARITY_LABEL[rarity]}`}
    >
      <Ionicons name={iconName} size={isMedium ? 13 : 11} color={color} />
      <Text
        style={[
          styles.label,
          isMedium ? styles.labelMedium : styles.labelSmall,
          { color },
        ]}
      >
        {RARITY_LABEL[rarity]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
  },
  pillSmall: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    gap: 4,
  },
  pillMedium: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    gap: 6,
  },
  label: {
    fontFamily: 'Inter-SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  labelSmall: {
    fontSize: 10,
  },
  labelMedium: {
    fontSize: 11,
  },
});
