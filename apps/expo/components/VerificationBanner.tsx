/**
 * Verification Banner Component
 *
 * Displays user's verification status and provides CTAs
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useActiveAccount, useReadContract } from 'thirdweb/react';
import { useVerificationContext } from '@/context/VerificationContext';
import { citizenNFTContract } from '@/constants/thirdweb';
import { useTheme } from '@/context/ThemeContext';

export default function VerificationBanner() {
  const router = useRouter();
  const account = useActiveAccount();
  const { hasCitizenNFT, hasAttesterNFT, activePendingRequest, nftStatus } = useVerificationContext();
  const { colors } = useTheme();

  // Loading state
  if (nftStatus.isLoading) {
    return (
      <View style={styles.container}>
        <View style={[styles.banner, styles.loadingBanner, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading verification status...</Text>
        </View>
      </View>
    );
  }

  // User is verified citizen
  if (hasCitizenNFT) {
    return (
      <View style={styles.container}>
        <View style={[styles.banner, styles.verifiedBanner]}>
          <View style={styles.content}>
            <Text style={styles.verifiedIcon}>✓</Text>
            <View style={styles.textContainer}>
              <Text style={styles.verifiedTitle}>Verifizierter Bürger</Text>
              <Text style={styles.verifiedSubtitle}>
                {hasAttesterNFT ? 'Bürger & Bescheiniger' : 'Du kannst jetzt abstimmen'}
              </Text>
            </View>
          </View>
        </View>
      </View>
    );
  }

  // User has pending request
  if (activePendingRequest) {
    // Safe defaults for missing fields
    const attesterSigs = activePendingRequest.attester_signatures ?? 0;
    const citizenSigs = activePendingRequest.citizen_signatures ?? 0;
    const nftType = activePendingRequest.nft_type || activePendingRequest.contract_type || 'citizen';

    const attesterRequired = nftType === 'citizen' ? 1 : 2;
    const progress = `${attesterSigs}/${attesterRequired} Bescheiniger`;
    const citizenProgress = nftType === 'citizen'
      ? `, ${citizenSigs}/1 Bürger`
      : '';

    return (
      <View style={styles.container}>
        <Pressable
          style={[styles.banner, styles.pendingBanner]}
          onPress={() => router.push('/verification/my-request' as any)}
        >
          <View style={styles.content}>
            <Text style={styles.pendingIcon}>⏳</Text>
            <View style={styles.textContainer}>
              <Text style={styles.pendingTitle}>Antrag ausstehend</Text>
              <Text style={styles.pendingSubtitle}>
                {progress}{citizenProgress}
              </Text>
            </View>
          </View>
          <Text style={[styles.arrow, { color: colors.textSecondary }]}>→</Text>
        </Pressable>
      </View>
    );
  }

  // User is not verified and has no pending request
  return (
    <View style={styles.container}>
      <Pressable
        style={[styles.banner, styles.registerBanner]}
        onPress={() => router.push('/verification/request-citizen' as any)}
      >
        <View style={styles.content}>
          <Text style={styles.registerIcon}>📝</Text>
          <View style={styles.textContainer}>
            <Text style={styles.registerTitle}>Bürger-Pass beantragen</Text>
            <Text style={styles.registerSubtitle}>
              Werde verifizierter Bürger und stimme ab
            </Text>
          </View>
        </View>
        <Text style={[styles.arrow, { color: colors.textSecondary }]}>→</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  banner: {
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  loadingBanner: {
    borderWidth: 1,
  },
  verifiedBanner: {
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  pendingBanner: {
    backgroundColor: '#FFF3E0',
    borderWidth: 1,
    borderColor: '#FF9800',
  },
  registerBanner: {
    backgroundColor: '#E3F2FD',
    borderWidth: 1,
    borderColor: '#194383',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  textContainer: {
    flex: 1,
    marginLeft: 12,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  verifiedIcon: {
    fontSize: 24,
    color: '#4CAF50',
  },
  verifiedTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#2E7D32',
    marginBottom: 2,
  },
  verifiedSubtitle: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: '#388E3C',
  },
  pendingIcon: {
    fontSize: 24,
  },
  pendingTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#E65100',
    marginBottom: 2,
  },
  pendingSubtitle: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: '#F57C00',
  },
  registerIcon: {
    fontSize: 24,
  },
  registerTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#1565C0',
    marginBottom: 2,
  },
  registerSubtitle: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: '#1976D2',
  },
  arrow: {
    fontSize: 20,
    marginLeft: 8,
  },
  smallButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginLeft: 8,
  },
  smallButtonText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#ffffff',
  },
});
