// Partner scanner — opens the camera and restricts scanning to
// roebel-card:v1:<card_id> QR payloads. On a valid scan, routes to the
// charge entry screen carrying the scanned card_id.

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import QRScanner, { type QRScanResult } from '@/components/QRScanner';
import { useTheme } from '@/context/ThemeContext';

export default function PartnerScanScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  const handleScan = (result: QRScanResult) => {
    if (result.type !== 'roebel_card' || !result.id) return;
    router.replace({
      pathname: '/roebel-card/partner/charge/[cardId]',
      params: { cardId: result.id },
    } as any);
  };

  return (
    <View style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <QRScanner onScan={handleScan} allowedTypes={['roebel_card']} />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
});
