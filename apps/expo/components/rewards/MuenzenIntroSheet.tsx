import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import BottomDrawer from '@/components/BottomDrawer';

// Same coin illustration as the Belohnungen hero (CoinBalanceHero).
const HERO_COIN = require('../../assets/illustration/muenzen/top_hero_coin.png');

interface MuenzenIntroSheetProps {
  visible: boolean;
  /** Dismiss (backdrop, drag, or the "Schließen" text button). */
  onClose: () => void;
  /** "Mehr erfahren" — open the Röbel Münzen info screen. */
  onLearnMore: () => void;
}

/**
 * One-time introduction to the Röbel Münzen feature, shown the first time a user
 * lands on the Belohnungen page. Centered coin, headline, short body, a primary
 * "learn more" CTA and a close text button.
 */
export default function MuenzenIntroSheet({
  visible,
  onClose,
  onLearnMore,
}: MuenzenIntroSheetProps) {
  const { colors } = useTheme();

  return (
    <BottomDrawer visible={visible} onClose={onClose}>
      <View style={styles.container}>
        <Image source={HERO_COIN} style={styles.coin} resizeMode="contain" />
        <Text style={[styles.headline, { color: colors.textPrimary }]}>
          Neu: Röbel Münzen
        </Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          Die neue lokale Währung für Röbel. Hol dir täglich Münzen, sende sie an
          andere Bürger:innen und öffne damit Truhen in der Schatzkammer.
        </Text>

        <Pressable
          onPress={onLearnMore}
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Mehr über Röbel Münzen erfahren"
        >
          <Text style={styles.ctaText}>Mehr erfahren</Text>
        </Pressable>

        <Pressable onPress={onClose} style={styles.closeBtn} accessibilityRole="button">
          <Text style={[styles.closeText, { color: colors.textSecondary }]}>Schließen</Text>
        </Pressable>
      </View>
    </BottomDrawer>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 16,
    gap: 12,
  },
  coin: {
    width: 124,
    height: 132,
    alignSelf: 'center',
  },
  headline: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 22,
    textAlign: 'center',
  },
  body: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  cta: {
    width: '100%',
    borderRadius: 999,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  ctaText: {
    color: '#fff',
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
  },
  closeBtn: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  closeText: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
  },
});
