/**
 * Verification QR Code Component
 *
 * Displays QR code with deep link to verification request
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable, Share } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';

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
  size = 180,
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

  const cardBg = isDark ? colors.surface : '#ffffff';

  return (
    <View style={styles.container}>
      <View style={[styles.card, { backgroundColor: cardBg, borderColor: colors.borderSecondary }]}>
        <View style={styles.qrWrap}>
          <QRCode value={deepLink} size={size} backgroundColor="#ffffff" color="#000000" />
        </View>

        <View style={[styles.progressRow, { borderTopColor: colors.borderSecondary }]}>
          <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>Bescheiniger</Text>
          <Text style={[styles.progressValue, { color: colors.textPrimary }]}>
            {attesterCount} / 1
          </Text>
        </View>

        {nftType === 'citizen' && (
          <View style={[styles.progressRow, { borderTopColor: colors.borderSecondary }]}>
            <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>Bürger</Text>
            <Text style={[styles.progressValue, { color: colors.textPrimary }]}>
              {citizenCount} / 1
            </Text>
          </View>
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
        <Ionicons name="paper-plane" size={16} color={colors.onPrimary} style={styles.shareIcon} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    paddingTop: 24,
    paddingBottom: 4,
    alignItems: 'stretch',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  qrWrap: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
  },
  progressLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  progressValue: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  infoContainer: {
    marginTop: 24,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  infoTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
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
  },
  shareButtonText: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
  },
  shareIcon: {
    marginLeft: 8,
  },
});
