/**
 * Verification QR Code Component
 *
 * Displays QR code with deep link to verification request
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable, Share } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useTheme } from '@/context/ThemeContext';
import { softShadow } from '@/lib/shadow';
import SentWhiteIcon from '@/assets/icons/sent-white.svg';

interface VerificationQRCodeProps {
  requestId: number;
  nftType: 'citizen' | 'attester';
  attesterCount: number;
  citizenCount: number;
  size?: number;
}

export default function VerificationQRCode({
  requestId,
  nftType,
  attesterCount,
  citizenCount,
  size = 210,
}: VerificationQRCodeProps) {
  const { colors, isDark } = useTheme();

  const webUrl = `https://www.roebel.app/verifizierung/nachweis/${requestId}?contract=${nftType}`;
  const deepLink = `roebel://verification/request/${requestId}?type=${nftType}`;

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Bitte unterschreiben Sie meinen ${nftType === 'citizen' ? 'Bürger' : 'Bescheiniger'}-Antrag:\n\n${webUrl}`,
        title: 'Verifizierungsantrag teilen',
      });
    } catch (error) {
      console.error('Failed to share:', error);
    }
  };

  const cardBg = isDark ? colors.surface : '#FFFFFF';
  const rowTextColor = isDark ? '#FFFFFF' : '#000000';
  const dividerColor = isDark ? 'rgba(255,255,255,0.08)' : '#EAEAEA';

  return (
    <View style={styles.container}>
      <View style={[styles.card, { backgroundColor: cardBg }, softShadow(2, isDark)]}>
        <View style={styles.qrWrap}>
          <QRCode value={deepLink} size={size} backgroundColor="#FFFFFF" color="#000000" />
        </View>

        <View style={styles.progressRow}>
          <Text style={[styles.progressLabel, { color: rowTextColor }]}>Bescheiniger</Text>
          <Text style={[styles.progressValue, { color: rowTextColor }]}>{attesterCount} / 1</Text>
        </View>

        {nftType === 'citizen' && (
          <>
            <View style={[styles.rowDivider, { backgroundColor: dividerColor }]} />
            <View style={styles.progressRow}>
              <Text style={[styles.progressLabel, { color: rowTextColor }]}>Bürger</Text>
              <Text style={[styles.progressValue, { color: rowTextColor }]}>{citizenCount} / 1</Text>
            </View>
          </>
        )}
      </View>

      <View style={styles.infoContainer}>
        <Text style={[styles.infoTitle, { color: colors.textPrimary }]}>QR-Code scannen lassen</Text>
        <Text style={[styles.infoText, { color: colors.textSecondary }]}>
          Lassen Sie andere Bürger diesen QR-Code scannen, um Ihren Antrag zu unterschreiben.
        </Text>
      </View>

      <Pressable
        style={[styles.shareButton, { backgroundColor: colors.primary }]}
        onPress={handleShare}
        accessibilityRole="button"
        accessibilityLabel="Link teilen"
      >
        <Text style={[styles.shareButtonText, { color: colors.onPrimary }]}>Link teilen</Text>
        <SentWhiteIcon width={20} height={20} style={styles.shareIcon} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  card: {
    alignSelf: 'center',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  qrWrap: {
    alignItems: 'center',
    paddingBottom: 12,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  progressLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
  progressValue: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
  rowDivider: {
    height: 1,
    marginHorizontal: 4,
  },
  infoContainer: {
    marginTop: 28,
    marginBottom: 20,
    paddingHorizontal: 8,
    alignSelf: 'stretch',
  },
  infoTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
    marginBottom: 6,
  },
  infoText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 19,
  },
  shareButton: {
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  shareButtonText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  shareIcon: {
    marginLeft: 8,
  },
});
