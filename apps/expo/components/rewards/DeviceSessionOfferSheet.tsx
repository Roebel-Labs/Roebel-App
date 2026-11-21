import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import BottomDrawer from '@/components/BottomDrawer';

type Props = {
  visible: boolean;
  /** "Erlauben": grant the device session (one fingerprint) and claim. */
  onAllow: () => void;
  /** "Nicht jetzt": no offer for 7 days, claim with the fingerprint as today. */
  onLater: () => void;
  /** Swiped away: no claim. */
  onClose: () => void;
};

/**
 * First-claim offer: claim Röbel Münzen on this device without the fingerprint (30 days,
 * mint only). One primary CTA, no shadows.
 */
export default function DeviceSessionOfferSheet({ visible, onAllow, onLater, onClose }: Props) {
  const { colors } = useTheme();
  return (
    <BottomDrawer visible={visible} onClose={onClose}>
      <View style={styles.container}>
        <Text style={[styles.headline, { color: colors.textPrimary }]}>Münzen abholen ohne Fingerabdruck?</Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          Die App darf 30 Tage lang auf diesem Gerät Röbel Münzen für dich abholen, ohne Fingerabdruck. Dafür wird dein
          Konto einmal aktualisiert. Für alles andere (Senden, Abstimmen, Bestätigungen, Kontoänderungen) fragen wir
          weiter nach deinem Fingerabdruck.
        </Text>
        <Pressable
          onPress={onAllow}
          style={({ pressed }) => [styles.cta, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Erlauben"
        >
          <Text style={styles.ctaText}>Erlauben</Text>
        </Pressable>
        <Pressable
          onPress={onLater}
          style={({ pressed }) => [styles.secondary, { opacity: pressed ? 0.6 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Nicht jetzt"
        >
          <Text style={[styles.secondaryText, { color: colors.textSecondary }]}>Nicht jetzt</Text>
        </Pressable>
      </View>
    </BottomDrawer>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: 8, paddingBottom: 16, gap: 12 },
  headline: { fontFamily: fontFamily.heading, fontSize: 22, lineHeight: 27, textAlign: 'center' },
  body: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20, textAlign: 'center', paddingHorizontal: 8 },
  cta: { width: '100%', borderRadius: 999, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
  ctaText: { color: '#fff', fontFamily: fontFamily.semiBold, fontSize: 16 },
  secondary: { paddingVertical: 12, alignItems: 'center' },
  secondaryText: { fontFamily: fontFamily.medium, fontSize: 15 },
});
