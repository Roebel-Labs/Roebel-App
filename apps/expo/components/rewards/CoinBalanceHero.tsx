import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import Skeleton from '@/components/ui/Skeleton';

interface CoinBalanceHeroProps {
  balance: number;
  /** Show a pulsing placeholder for the balance while it loads. */
  loading?: boolean;
  label?: string;
  sublabel?: string;
  /** Verification status pill: true = verified, false = not yet, null/undefined = hide. */
  verified?: boolean | null;
}

const HERO_IMAGE = require('../../assets/illustration/muenzen/top_hero_coin.png');

export default function CoinBalanceHero({
  balance,
  loading,
  label = 'Mein Guthaben',
  sublabel,
  verified,
}: CoinBalanceHeroProps) {
  const { colors, isDark } = useTheme();

  const pillBg = verified
    ? 'rgba(34,197,94,0.16)'
    : 'rgba(245,158,11,0.16)';
  const pillColor = verified
    ? (isDark ? '#4ADE80' : '#15803D')
    : (isDark ? '#FBBF24' : '#B45309');

  return (
    <View style={styles.container}>
      <View style={styles.textBlock}>
        {verified != null && (
          <View style={[styles.statusPill, { backgroundColor: pillBg }]}>
            <Text style={[styles.statusText, { color: pillColor }]}>
              {verified ? '✓ Verifiziert' : '● Nicht verifiziert'}
            </Text>
          </View>
        )}
        <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
        {loading ? (
          <Skeleton width={120} height={46} radius={12} style={{ marginTop: 4 }} />
        ) : (
          <Text style={[styles.balance, { color: colors.textPrimary }]}>
            {balance.toLocaleString('de-DE')}
          </Text>
        )}
        {!!sublabel && (
          <Text style={[styles.sublabel, { color: colors.textSecondary }]}>{sublabel}</Text>
        )}
      </View>
      <Image source={HERO_IMAGE} style={styles.image} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 18,
    overflow: 'hidden',
  },
  textBlock: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
  },
  balance: {
    fontFamily: 'Inter-Medium',
    fontSize: 40,
    letterSpacing: -0.8,
    marginTop: 4,
  },
  sublabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    marginTop: 4,
  },
  image: {
    width: 96,
    height: 104,
    marginRight: -6,
  },
});
