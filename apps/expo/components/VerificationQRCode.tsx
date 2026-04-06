/**
 * Verification QR Code Component
 *
 * Displays QR code with deep link to verification request
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable, Share } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useTheme } from '@/context/ThemeContext';

interface VerificationQRCodeProps {
  requestId: number;
  nftType: 'citizen' | 'attester';
  size?: number;
}

export default function VerificationQRCode({
  requestId,
  nftType,
  size = 200,
}: VerificationQRCodeProps) {
  const { colors } = useTheme();

  // Generate web URL for roebel.app
  const webUrl = `https://www.roebel.app/verifizierung/nachweis/${requestId}?contract=${nftType}`;
  // Generate deep link URL for QR code
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

  return (
    <View style={styles.container}>
      {/* QR Code */}
      <View style={[styles.qrContainer, { backgroundColor: colors.background, borderColor: colors.borderSecondary }]}>
        <QRCode
          value={deepLink}
          size={size}
          backgroundColor="white"
          color="black"
        />
      </View>

      {/* Info */}
      <View style={styles.infoContainer}>
        <Text style={[styles.infoTitle, { color: colors.textPrimary }]}>QR-Code scannen lassen</Text>
        <Text style={[styles.infoText, { color: colors.textSecondary }]}>
          Lassen Sie andere Bürger und Bescheiniger diesen QR-Code scannen, um Ihren Antrag zu unterschreiben.
        </Text>
      </View>

      {/* Request Info */}
      <View style={[styles.detailsBox, { backgroundColor: colors.surface }]}>
        <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Antrag-ID:</Text>
        <Text style={[styles.detailValue, { color: colors.textPrimary }]}>#{requestId}</Text>
      </View>

      <View style={[styles.detailsBox, { backgroundColor: colors.surface }]}>
        <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Typ:</Text>
        <Text style={[styles.detailValue, { color: colors.textPrimary }]}>
          {nftType === 'citizen' ? 'Bürger-Pass' : 'Bescheiniger-Pass'}
        </Text>
      </View>

      {/* Share Button */}
      <Pressable style={[styles.shareButton, { backgroundColor: colors.primary }]} onPress={handleShare}>
        <Text style={[styles.shareButtonText, { color: colors.onPrimary }]}>📤 Link teilen</Text>
      </Pressable>

      {/* Web Link (for copying) */}
      <Text style={[styles.linkText, { color: colors.textTertiary }]} selectable>
        {webUrl}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  qrContainer: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 24,
    // Shadow for iOS
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    // Shadow for Android
    elevation: 4,
  },
  infoContainer: {
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  infoTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 20,
  },
  detailsBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  detailValue: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  shareButton: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    marginTop: 16,
    marginBottom: 16,
    width: '100%',
    alignItems: 'center',
  },
  shareButtonText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  linkText: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    paddingHorizontal: 16,
  },
});
