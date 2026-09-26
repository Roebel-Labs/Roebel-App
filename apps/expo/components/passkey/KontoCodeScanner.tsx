/**
 * Camera scanner for a family member's "Mein Konto-Code". Accepts only a valid
 * roebel://passkey/guardian?safe=… link; anything else shows a plain hint and keeps scanning.
 */
import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { parseKontoCode, type GuardianLink } from '@/lib/passkey/deeplinks';
import { BigButton } from './PasskeyUi';

const BARCODE_SETTINGS = { barcodeTypes: ['qr'] as const };

export default function KontoCodeScanner({ onFound }: { onFound: (link: GuardianLink) => void }) {
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [hint, setHint] = useState<string | null>(null);
  const done = useRef(false);

  const onScan = useCallback(
    ({ data }: { data: string }) => {
      if (done.current) return;
      const link = parseKontoCode(data);
      if (!link) {
        setHint('Das ist kein Konto-Code. Bitte den Code unter „Mein Konto-Code“ scannen.');
        return;
      }
      done.current = true;
      onFound(link);
    },
    [onFound],
  );

  if (!permission) return <View style={styles.box} />;
  if (!permission.granted) {
    return (
      <View style={[styles.box, styles.center, { backgroundColor: colors.surfaceSecondary }]}>
        <Text style={[styles.text, { color: colors.textPrimary }]}>Zum Scannen brauchen wir die Kamera.</Text>
        <BigButton label="Kamera erlauben" onPress={() => requestPermission().catch(() => undefined)} />
      </View>
    );
  }
  return (
    <View style={styles.wrap}>
      <View style={styles.box}>
        <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={BARCODE_SETTINGS} onBarcodeScanned={onScan} />
      </View>
      <Text style={[styles.text, { color: hint ? colors.error : colors.textSecondary }]}>
        {hint ?? 'Halte die Kamera auf den Konto-Code der Person.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  box: { height: 300, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center', padding: 20, gap: 16 },
  text: { fontFamily: fontFamily.medium, fontSize: 16, lineHeight: 22, textAlign: 'center' },
});
