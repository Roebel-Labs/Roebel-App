import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useTheme } from '@/context/ThemeContext';
import { formatEuros } from '@/lib/format-currency';
import BottomDrawer from '@/components/BottomDrawer';

type Props = {
  visible: boolean;
  onClose: () => void;
  balanceCents: number;
  qrPayload: string | null;
  qrError: string | null;
};

export default function RoebelCardRedeemSheet({
  visible,
  onClose,
  balanceCents,
  qrPayload,
  qrError,
}: Props) {
  const { colors } = useTheme();

  return (
    <BottomDrawer visible={visible} onClose={onClose}>
      <View style={styles.container}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          Einlösen
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Guthaben: {formatEuros(balanceCents)}
        </Text>

        <View style={[styles.qrBox, { backgroundColor: '#ffffff' }]}>
          {qrPayload ? (
            <QRCode
              value={qrPayload}
              size={240}
              color="#000000"
              backgroundColor="#ffffff"
            />
          ) : (
            <View style={styles.qrPlaceholder}>
              {qrError ? (
                <Text style={styles.qrErrorText}>{qrError}</Text>
              ) : (
                <ActivityIndicator color="#000000" />
              )}
            </View>
          )}
        </View>

        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          Zeige diesen Code dem Partner zum Bezahlen.{'\n'}
          Der Betrag wird dir zur Bestätigung angezeigt.
        </Text>

        <Pressable
          onPress={onClose}
          style={[
            styles.doneButton,
            { borderColor: colors.borderSecondary },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Fertig"
        >
          <Text style={[styles.doneLabel, { color: colors.primary }]}>
            Fertig
          </Text>
        </Pressable>
      </View>
    </BottomDrawer>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    alignItems: 'center',
    gap: 16,
  },
  title: {
    fontSize: 22,
    fontFamily: 'Inter-SemiBold',
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  qrBox: {
    padding: 20,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    width: 280,
    height: 280,
    marginTop: 8,
  },
  qrPlaceholder: {
    width: 240,
    height: 240,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrErrorText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: '#DC2626',
    textAlign: 'center',
    padding: 16,
  },
  hint: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 4,
  },
  doneButton: {
    height: 52,
    borderRadius: 9999,
    borderWidth: 1,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    marginTop: 4,
  },
  doneLabel: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },
});
