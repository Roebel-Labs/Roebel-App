import React from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useRewards } from '@/context/RewardsContext';
import { useRequireAuth } from '@/context/AuthGateContext';

interface RewardsCTABannerProps {
  variant?: 'default' | 'guest';
}

const COIN_STACK = require('../../assets/illustration/gamification/stack.png');

export default function RewardsCTABanner({ variant = 'default' }: RewardsCTABannerProps) {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { coins, keyCount } = useRewards();
  const requireAuth = useRequireAuth();

  const subtitle =
    variant === 'guest'
      ? 'Münzen sammeln, Truhen öffnen, Schlüssel verdienen'
      : `${coins.toLocaleString('de-DE')} Münzen · ${keyCount} Schlüssel`;

  return (
    <Pressable
      onPress={() => requireAuth(() => router.push('/rewards' as any))}
      style={({ pressed }) => [
        styles.banner,
        {
          backgroundColor: isDark ? colors.surface : '#FFFFFF',
          opacity: pressed ? 0.9 : 1,
        },
        Platform.select({
          ios: {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: isDark ? 0.2 : 0.12,
            shadowRadius: 12,
          },
          android: { elevation: 4 },
        }),
      ]}
      accessibilityRole="button"
      accessibilityLabel="Belohnungen öffnen"
    >
      <Image source={COIN_STACK} style={styles.coinIcon} resizeMode="contain" />
      <View style={styles.textBlock}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Belohnungen</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
  },
  coinIcon: {
    width: 40,
    height: 40,
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
});
