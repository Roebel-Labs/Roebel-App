import React from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useRewards } from '@/context/RewardsContext';

interface RewardsCTABannerProps {
  variant?: 'default' | 'guest';
}

const CHEST = require('../../assets/illustration/gamification/lootbox.png');
const COIN_STACK = require('../../assets/illustration/gamification/stack.png');

export default function RewardsCTABanner({ variant = 'default' }: RewardsCTABannerProps) {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { coins, keyCount } = useRewards();

  const subtitle =
    variant === 'guest'
      ? 'Münzen sammeln, Truhen öffnen, Schlüssel verdienen'
      : `${coins.toLocaleString('de-DE')} Münzen · ${keyCount} Schlüssel`;

  return (
    <Pressable
      onPress={() => router.push('/rewards' as any)}
      style={({ pressed }) => [
        styles.banner,
        {
          backgroundColor: isDark ? '#22324c' : '#EEF4FB',
          borderColor: colors.primary,
          opacity: pressed ? 0.9 : 1,
        },
        Platform.select({
          ios: {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: isDark ? 0.2 : 0.1,
            shadowRadius: 10,
          },
          android: { elevation: 3 },
        }),
      ]}
      accessibilityRole="button"
      accessibilityLabel="Belohnungen öffnen"
    >
      <Image source={COIN_STACK} style={styles.iconLeft} resizeMode="contain" />
      <View style={styles.textBlock}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Belohnungen</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
      <Image source={CHEST} style={styles.iconRight} resizeMode="contain" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
  },
  iconLeft: {
    width: 48,
    height: 48,
  },
  textBlock: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
  },
  subtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    marginTop: 2,
  },
  iconRight: {
    width: 58,
    height: 58,
  },
});
