import React from 'react';
import { Image, Pressable, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useRewards } from '@/context/RewardsContext';

interface CoinBalanceBadgeProps {
  onPress?: () => void;
  compact?: boolean;
}

const COIN = require('../../assets/illustration/gamification/single.png');

/**
 * Small pill showing the user's current Münzen balance. Default onPress routes
 * to /rewards so any screen header can use it as a quick coin indicator.
 */
export default function CoinBalanceBadge({ onPress, compact }: CoinBalanceBadgeProps) {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { coins } = useRewards();

  const handlePress = () => {
    if (onPress) onPress();
    else router.push('/rewards' as any);
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
      accessibilityLabel={`${coins} Münzen`}
    >
      <Image source={COIN} style={styles.icon} resizeMode="contain" />
      <Text style={[styles.count, { color: isDark ? '#F6D271' : '#8A5A00' }]}>
        {coins.toLocaleString('de-DE')}
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
  icon: {
    width: 16,
    height: 16,
  },
  count: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
  },
});
