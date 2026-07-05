import React from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useRoebelTaler } from '@/hooks/useRoebelTaler';
import ChevronRightIcon from '@/assets/icons/chevron-right.svg';
import { softShadow } from '@/lib/shadow';

const COIN_STACK = require('../../assets/illustration/gamification/stack.png');

export default function CoinsCard() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { talerBalance } = useRoebelTaler();
  const cardBg = colors.background;
  // The REAL on-chain Röbel Münzen for everyone — citizens hold the shared
  // Münzen, guests their personal ones. Whole Münzen, no decimals.
  const display = Math.round(talerBalance).toLocaleString('de-DE');

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: cardBg },
        softShadow(2, isDark),
      ]}
    >
      <Pressable
        onPress={() => router.push('/rewards' as any)}
        style={({ pressed }) => [styles.left, { opacity: pressed ? 0.7 : 1 }]}
        accessibilityRole="button"
        accessibilityLabel="Münzen anzeigen"
      >
        <Image source={COIN_STACK} style={styles.coin} resizeMode="contain" />
        <Text style={[styles.balance, { color: colors.textPrimary }]}>
          {display} Münzen
        </Text>
        <ChevronRightIcon width={16} height={16} color={colors.textSecondary} />
      </Pressable>

      <Pressable
        onPress={() => router.push('/rewards' as any)}
        style={({ pressed }) => [
          styles.cta,
          { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Münzen einlösen"
      >
        <Text style={[styles.ctaText, { color: colors.onPrimary }]}>Einlösen</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 8,
    marginHorizontal: 16,
    marginTop: 12,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    paddingVertical: 6,
  },
  coin: {
    width: 28,
    height: 28,
  },
  balance: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
  },
  cta: {
    height: 36,
    paddingHorizontal: 18,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontFamily: 'MonaSansSemiCondensed-Bold',
    fontSize: 14,
  },
});
