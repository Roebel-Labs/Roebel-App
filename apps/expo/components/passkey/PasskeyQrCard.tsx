import React from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { BigButton, Card } from './PasskeyUi';

/** A QR code with the person's NAME under it (never the address) and a share button. */
export default function PasskeyQrCard({
  value,
  name,
  caption,
  shareMessage,
}: {
  value: string;
  name: string;
  caption?: string;
  shareMessage: string;
}) {
  const { colors } = useTheme();
  const onShare = () => {
    Share.share({ message: `${shareMessage}\n${value}` }).catch(() => undefined);
  };
  return (
    <Card style={styles.card}>
      <View style={styles.qrWrap} accessible accessibilityLabel={`QR-Code von ${name}`}>
        <QRCode value={value} size={232} backgroundColor="#ffffff" color="#000000" quietZone={12} />
      </View>
      <Text style={[styles.name, { color: colors.textPrimary }]}>{name}</Text>
      {caption ? <Text style={[styles.caption, { color: colors.textSecondary }]}>{caption}</Text> : null}
      <BigButton label="Als Link teilen" kind="secondary" onPress={onShare} style={styles.share} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', paddingVertical: 24 },
  qrWrap: { borderRadius: 16, overflow: 'hidden', backgroundColor: '#ffffff' },
  name: { fontFamily: fontFamily.heading, fontSize: 24, textAlign: 'center', marginTop: 8 },
  caption: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  share: { alignSelf: 'stretch' },
});
