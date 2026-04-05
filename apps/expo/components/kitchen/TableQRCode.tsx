import React, { useRef } from 'react';
import { View, Text, Pressable, Share, StyleSheet } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  slug: string;
  tableNumber: string;
};

export default function TableQRCode({ slug, tableNumber }: Props) {
  const { colors } = useTheme();
  const qrRef = useRef<any>(null);
  const url = `https://roebel.app/order/${slug}/${encodeURIComponent(tableNumber)}`;

  const handleShare = async () => {
    try {
      await Share.share({
        message: `QR-Code für Tisch ${tableNumber}: ${url}`,
        url,
      });
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  return (
    <View style={styles.container}>
      <QRCode
        value={url}
        size={200}
        backgroundColor="white"
        color="black"
        getRef={(ref: any) => (qrRef.current = ref)}
      />
      <Text style={[styles.tableLabel, { color: colors.textPrimary }]}>
        Tisch {tableNumber}
      </Text>
      <Text style={[styles.urlText, { color: colors.textTertiary }]}>{url}</Text>
      <Pressable
        onPress={handleShare}
        style={[styles.shareBtn, { backgroundColor: colors.primary }]}
      >
        <Text style={[styles.shareBtnText, { color: colors.onPrimary }]}>Teilen / Drucken</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: 20,
  },
  tableLabel: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    marginTop: 16,
  },
  urlText: {
    fontSize: 12,
    marginTop: 4,
  },
  shareBtn: {
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginTop: 16,
  },
  shareBtnText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
});
