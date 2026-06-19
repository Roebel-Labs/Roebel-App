import React from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';

const COIN = require('../../assets/illustration/taler/multiple.png');

interface MintSuccessOverlayProps {
  visible: boolean;
  /** Current Röbel Münzen balance to celebrate (already refreshed). */
  balance: number;
  onClose: () => void;
}

/**
 * Full-screen success "Coin screen" shown after a successful daily mint, in place
 * of a snackbar. Big Röbel Münzen stack illustration + the new balance.
 */
export default function MintSuccessOverlay({ visible, balance, onClose }: MintSuccessOverlayProps) {
  const { colors } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        <View style={styles.center}>
          <Image source={COIN} style={styles.coin} resizeMode="contain" />
          <Text style={[styles.title, { color: colors.textPrimary }]}>Stark gemacht!</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Deine Röbel Münzen für heute sind da.
          </Text>
          <View style={[styles.balancePill, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>Dein Guthaben</Text>
            <Text style={[styles.balanceValue, { color: colors.textPrimary }]}>
              {balance.toLocaleString('de-DE')}{' '}
              <Text style={{ color: colors.primary, fontFamily: 'Inter-SemiBold', fontSize: 18 }}>
                Röbel Münzen
              </Text>
            </Text>
          </View>
        </View>

        <Pressable
          onPress={onClose}
          style={({ pressed }) => [styles.cta, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Weiter"
        >
          <Text style={styles.ctaText}>Weiter</Text>
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: 24, paddingBottom: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  coin: { width: 220, height: 220, marginBottom: 8 },
  title: { fontFamily: 'Inter-Bold', fontSize: 28, textAlign: 'center' },
  subtitle: { fontFamily: 'Inter-Regular', fontSize: 15, textAlign: 'center', maxWidth: 280 },
  balancePill: {
    marginTop: 18,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 2,
  },
  balanceLabel: { fontFamily: 'Inter-Medium', fontSize: 13 },
  balanceValue: { fontFamily: 'Inter-Bold', fontSize: 26 },
  cta: {
    borderRadius: 999,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { color: '#fff', fontFamily: 'Inter-SemiBold', fontSize: 16 },
});
