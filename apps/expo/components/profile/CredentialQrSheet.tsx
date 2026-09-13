import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import BottomDrawer from '@/components/BottomDrawer';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  visible: boolean;
  onClose: () => void;
  requestId: number | null;
};

/** The Bürgerausweis QR (deep link to the verification request) in a drawer. */
export default function CredentialQrSheet({ visible, onClose, requestId }: Props) {
  const { colors } = useTheme();
  return (
    <BottomDrawer visible={visible} onClose={onClose} snapPoint={0.55}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Bürgerausweis vorzeigen</Text>
      <Text style={[styles.sub, { color: colors.textSecondary }]}>
        Bescheiniger:innen scannen diesen Code, um deinen Ausweis zu prüfen.
      </Text>
      <View style={styles.qrWrap}>
        {requestId ? (
          <View style={styles.qrCard}>
            <QRCode value={`roebel://verification/request/${requestId}?type=citizen`} size={200} />
          </View>
        ) : (
          <Text style={[styles.sub, { color: colors.textSecondary }]}>Für diesen Ausweis liegt kein Antrag vor.</Text>
        )}
      </View>
    </BottomDrawer>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontFamily: 'Inter-SemiBold', marginBottom: 6 },
  sub: { fontSize: 14, fontFamily: 'Inter-Regular', lineHeight: 20 },
  qrWrap: { alignItems: 'center', paddingVertical: 24 },
  qrCard: { padding: 16, borderRadius: 16, backgroundColor: '#FFFFFF' },
});
