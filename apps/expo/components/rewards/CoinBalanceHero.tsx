import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

interface CoinBalanceHeroProps {
  balance: number;
  label?: string;
  sublabel?: string;
}

const HERO_IMAGE = require('../../assets/illustration/gamification/hero-coin.png');

export default function CoinBalanceHero({
  balance,
  label = 'Mein Guthaben',
  sublabel,
}: CoinBalanceHeroProps) {
  const { colors, isDark } = useTheme();

  return (
    <View style={styles.container}>
      <View style={styles.textBlock}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
        <Text style={[styles.balance, { color: colors.textPrimary }]}>
          {balance.toLocaleString('de-DE')}
        </Text>
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
    fontFamily: 'Inter-SemiBold',
    fontSize: 44,
    letterSpacing: -0.5,
    marginTop: 4,
  },
  sublabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    marginTop: 4,
  },
  image: {
    width: 108,
    height: 108,
    marginRight: -10,
  },
});
