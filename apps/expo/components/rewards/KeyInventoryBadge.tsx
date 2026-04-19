import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useRewards } from '@/context/RewardsContext';

interface KeyInventoryBadgeProps {
  onPress?: () => void;
  compact?: boolean;
}

/**
 * Small pill showing the user's current key count. Tappable — navigates to the
 * Schatzkammer by default.
 */
export default function KeyInventoryBadge({ onPress, compact }: KeyInventoryBadgeProps) {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const { keyCount } = useRewards();

  const handlePress = () => {
    if (onPress) onPress();
    else router.push('/rewards/schatzkammer' as any);
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.pill,
        {
          backgroundColor: isDark ? colors.surface : '#FFFBEA',
          borderColor: '#E9B949',
          opacity: pressed ? 0.75 : 1,
          paddingHorizontal: compact ? 10 : 12,
          paddingVertical: compact ? 5 : 6,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${keyCount} Schlüssel in der Schatzkammer`}
    >
      <Text style={styles.emoji}>🗝️</Text>
      <Text style={[styles.count, { color: isDark ? '#F6D271' : '#8A5A00' }]}>
        {keyCount}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  emoji: {
    fontSize: 14,
  },
  count: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
  },
});
