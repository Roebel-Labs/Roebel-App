import React, { useRef } from 'react';
import { View, Text, Pressable, Share } from 'react-native';
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
    <View style={{ alignItems: 'center', padding: 20 }}>
      <QRCode
        value={url}
        size={200}
        backgroundColor="white"
        color="black"
        getRef={(ref: any) => (qrRef.current = ref)}
      />
      <Text style={{ fontSize: 16, fontFamily: 'Inter-Medium', color: colors.textPrimary, marginTop: 16 }}>
        Tisch {tableNumber}
      </Text>
      <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 4 }}>{url}</Text>
      <Pressable
        onPress={handleShare}
        style={{ backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10, marginTop: 16 }}
      >
        <Text style={{ color: colors.onPrimary, fontSize: 14, fontFamily: 'Inter-Medium' }}>Teilen / Drucken</Text>
      </Pressable>
    </View>
  );
}
