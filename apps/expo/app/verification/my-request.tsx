/**
 * My Request Screen
 *
 * Displays user's active pending verification request with QR code
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useVerificationContext } from '@/context/VerificationContext';
import { useRequestDetails } from '@/hooks/useVerification';
import { useAttesters } from '@/hooks/useAttesters';
import { useTheme } from '@/context/ThemeContext';
import VerificationQRCode from '@/components/VerificationQRCode';
import AttesterGrid from '@/components/AttesterGrid';
import MyRequestSkeleton from '@/components/MyRequestSkeleton';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

export default function MyRequestScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { activePendingRequest, hasCitizenNFT, refresh } = useVerificationContext();
  const [refreshing, setRefreshing] = useState(false);

  const requestId = activePendingRequest?.request_id;
  const nftType = activePendingRequest?.nft_type || activePendingRequest?.contract_type || 'citizen';

  const { request, decryptedData, isLoading, fetchRequest } = useRequestDetails(
    requestId || 0,
    nftType
  );

  const { attesters, isLoading: attestersLoading, refresh: refreshAttesters } = useAttesters();

  useEffect(() => {
    if (requestId) {
      fetchRequest();
    }
  }, [requestId]);

  // Poll on-chain so signatures made elsewhere (e.g. via the web app) appear live.
  useEffect(() => {
    if (!requestId) return;
    const id = setInterval(() => { fetchRequest(); }, 12000);
    return () => clearInterval(id);
  }, [requestId, fetchRequest]);

  // When the on-chain request executes (NFT minted), refresh context so the
  // screen transitions to the verified state.
  useEffect(() => {
    if (request?.status === 3) {
      refresh();
    }
  }, [request?.status]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      refresh(),
      requestId ? fetchRequest() : Promise.resolve(),
      refreshAttesters(),
    ]);
    setRefreshing(false);
  };

  const gradientColors: readonly [string, string] = isDark
    ? ['#1a2335', '#202124']
    : ['#E4F2FF', '#FFFFFF'];

  if (hasCitizenNFT) {
    return (
      <LinearGradient colors={gradientColors} style={styles.container} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}>
        <SafeAreaView style={styles.flex}>
          <View style={styles.messageContainer}>
            <Text style={[styles.messageTitle, { color: colors.textPrimary }]}>&#x2713; Bereits verifiziert</Text>
            <Text style={[styles.messageText, { color: colors.textSecondary }]}>
              Sie sind bereits ein verifizierter Bürger!
            </Text>
            <Pressable style={[styles.button, { backgroundColor: colors.primary }]} onPress={() => router.back()}>
              <Text style={[styles.buttonText, { color: colors.onPrimary }]}>Zurück</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  if (!activePendingRequest) {
    return (
      <LinearGradient colors={gradientColors} style={styles.container} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}>
        <SafeAreaView style={styles.flex}>
          <View style={styles.messageContainer}>
            <Text style={[styles.messageTitle, { color: colors.textPrimary }]}>Kein Antrag</Text>
            <Text style={[styles.messageText, { color: colors.textSecondary }]}>
              Sie haben keinen ausstehenden Verifizierungsantrag.
            </Text>
            <Pressable
              style={[styles.button, { backgroundColor: colors.primary }]}
              onPress={() => router.push('/verification/request-citizen' as any)}
            >
              <Text style={[styles.buttonText, { color: colors.onPrimary }]}>Antrag erstellen</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  const backButtonBg = isDark ? colors.surface : '#FFFFFF';
  const dividerColor = isDark ? 'rgba(255,255,255,0.12)' : colors.borderSecondary;
  const disclaimerIconColor = isDark ? '#9aa0a6' : '#6e7277';

  return (
    <LinearGradient colors={gradientColors} style={styles.container} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}>
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={[styles.backButton, { backgroundColor: backButtonBg }]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Zurück"
          >
            <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Antrag</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentInner}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.textSecondary} />
          }
        >
          {isLoading ? (
            <MyRequestSkeleton />
          ) : (
            <>
              <View style={styles.qrSection}>
                <VerificationQRCode
                  requestId={requestId as number}
                  nftType={nftType}
                  attesterCount={request?.attesterSignatures ?? activePendingRequest.attester_signatures ?? 0}
                  citizenCount={request?.citizenSignatures ?? activePendingRequest.citizen_signatures ?? 0}
                  requiredAttesters={request?.requiredAttesters ?? 2}
                  requiredCitizens={request?.requiredCitizens ?? 1}
                />
              </View>

              {decryptedData && (
                <View style={styles.privateSection}>
                  <View style={[styles.shortDivider, { backgroundColor: dividerColor }]} />

                  <View style={styles.privateDataCard}>
                    <View style={styles.privateRow}>
                      <Text style={styles.privateLabel}>Name:</Text>
                      <Text style={styles.privateValue}>{decryptedData.name}</Text>
                    </View>
                    <View style={styles.privateRow}>
                      <Text style={styles.privateLabel}>Adresse:</Text>
                      <Text style={styles.privateValue}>{decryptedData.address}</Text>
                    </View>
                  </View>

                  <View style={styles.privateDisclaimerRow}>
                    <Ionicons name="lock-closed" size={12} color={disclaimerIconColor} />
                    <Text style={[styles.privateDisclaimer, { color: disclaimerIconColor }]}>
                      Diese Daten sind verschlüsselt. Nur Sie können Sie sehen.
                    </Text>
                  </View>
                </View>
              )}

              <AttesterGrid attesters={attesters} isLoading={attestersLoading} />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  backButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontFamily: 'MonaSansSemiCondensed-Medium',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 48,
  },
  content: {
    flex: 1,
  },
  contentInner: {
    paddingBottom: 32,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    marginTop: 12,
  },
  qrSection: {
    marginTop: 8,
    marginBottom: 4,
  },
  privateSection: {
    marginTop: 20,
  },
  shortDivider: {
    height: 1,
    width: 160,
    alignSelf: 'center',
    marginBottom: 20,
  },
  privateDataCard: {
    backgroundColor: '#000000',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginHorizontal: 16,
  },
  privateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  privateLabel: {
    fontFamily: 'GeistMono-Regular',
    fontSize: 13,
    color: '#E8EAED',
  },
  privateValue: {
    fontFamily: 'GeistMono-Regular',
    fontSize: 13,
    color: '#E8EAED',
    textAlign: 'right',
    flex: 1,
    marginLeft: 12,
  },
  privateDisclaimerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginTop: 12,
  },
  privateDisclaimer: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    flex: 1,
  },
  messageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  messageTitle: {
    fontSize: 24,
    fontFamily: 'Inter-Medium',
    marginBottom: 12,
  },
  messageText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  button: {
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  buttonText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
});
