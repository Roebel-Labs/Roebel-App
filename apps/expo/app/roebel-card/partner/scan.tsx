// Partner scanner — opens the camera and restricts scanning to Röbel Card
// QR payloads (v2 HMAC-signed). On a valid scan, routes to the charge
// entry screen carrying BOTH the parsed card_id (for a nice URL) and
// the full signed payload string (for the server-side HMAC verification
// in create_roebel_card_charge_from_qr).

import React from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import QRScanner, { type QRScanResult } from '@/components/QRScanner';
import { useTheme } from '@/context/ThemeContext';

export default function PartnerScanScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  const handleScan = (result: QRScanResult) => {
    if (result.type !== 'roebel_card' || !result.id || !result.cardPayload) return;

    // The server-side RPC rejects v1 payloads — short-circuit here with
    // a clearer message so the partner knows to ask the buyer to update.
    if (result.cardVersion !== 'v2') {
      Alert.alert(
        'Veralteter QR-Code',
        'Diese Karte nutzt ein altes QR-Format. Bitte bitte den Kunden, die App neu zu laden.',
      );
      return;
    }

    router.replace({
      pathname: '/roebel-card/partner/charge/[cardId]',
      params: { cardId: result.id, payload: result.cardPayload },
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
