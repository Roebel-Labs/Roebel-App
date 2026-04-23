/**
 * My Request Screen
 *
 * Displays user's active pending verification request with QR code
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import { useVerificationContext } from '@/context/VerificationContext';
import { useRequestDetails } from '@/hooks/useVerification';
import { useTheme } from '@/context/ThemeContext';
import VerificationQRCode from '@/components/VerificationQRCode';
import { ArrowLeftIcon } from '@/components/Icons';

export default function MyRequestScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const account = useActiveAccount();
  const { activePendingRequest, hasCitizenNFT, refresh } = useVerificationContext();
  const [refreshing, setRefreshing] = useState(false);

  const requestId = activePendingRequest?.request_id;
  const nftType = activePendingRequest?.nft_type || activePendingRequest?.contract_type || 'citizen';

  const { request, evidence, decryptedData, isLoading, fetchRequest } = useRequestDetails(
    requestId || 0,
    nftType
  );

  useEffect(() => {
    if (requestId) {
      fetchRequest();
    }
  }, [requestId]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    if (requestId) {
      await fetchRequest();
    }
    setRefreshing(false);
  };

  // Redirect if verified
  if (hasCitizenNFT) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
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
    );
  }

  // No pending request
  if (!activePendingRequest) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.messageContainer}>
          <Text style={[styles.messageTitle, { color: colors.textPrimary }]}>&#x1F4DD; Kein Antrag</Text>
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
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={[styles.backButton, { backgroundColor: colors.surface }]}>
          <ArrowLeftIcon size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Mein Antrag</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Lade Antrag...</Text>
          </View>
        ) : (
          <>
            {/* QR Code */}
            <View style={styles.qrSection}>
              <VerificationQRCode requestId={requestId} nftType={nftType} />
            </View>

            {/* Decrypted Personal Data (Owner View) */}
            {decryptedData && (
              <View style={styles.dataSection}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Ihre Daten (verschlüsselt)</Text>
                <View style={[styles.dataCard, { backgroundColor: colors.successBackground, borderColor: colors.success }]}>
                  <View style={styles.dataRow}>
                    <Text style={styles.dataLabel}>Name:</Text>
                    <Text style={styles.dataValue}>{decryptedData.name}</Text>
                  </View>
                  <View style={styles.dataRow}>
                    <Text style={styles.dataLabel}>Adresse:</Text>
                    <Text style={styles.dataValue}>{decryptedData.address}</Text>
                  </View>
                </View>
                <Text style={styles.dataHint}>
                  &#x1F512; Diese Daten sind verschlüsselt. Nur Sie können sie sehen.
                </Text>
              </View>
            )}

            {/* Public Metadata */}
            {evidence?.metadata && (
              <View style={styles.metadataSection}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Öffentliche Informationen</Text>
                <View style={[styles.metadataCard, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.metadataLabel, { color: colors.textSecondary }]}>Grund:</Text>
                  <Text style={[styles.metadataValue, { color: colors.textPrimary }]}>{evidence.metadata.reason}</Text>
                </View>
              </View>
            )}

            {/* Status Banner - MOVED TO BOTTOM */}
            <View style={styles.statusBanner}>
              <Text style={styles.statusIcon}>&#x23F3;</Text>
              <View style={styles.statusTextContainer}>
                <Text style={styles.statusTitle}>Antrag ausstehend</Text>
                <Text style={[styles.statusSubtitle, { color: colors.warning }]}>
                  Lassen Sie Ihren QR-Code von Bürgern und Bescheinigern scannen
                </Text>
              </View>
            </View>

            {/* Signature Progress - MOVED TO BOTTOM */}
            <View style={styles.progressSection}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Unterschriften-Fortschritt</Text>

              <View style={[styles.progressCard, { backgroundColor: colors.surface }]}>
                <View style={styles.progressItem}>
                  <Text style={[styles.progressLabel, { color: colors.textPrimary }]}>Bescheiniger</Text>
                  <View style={styles.progressBar}>
                    <Text style={[styles.progressText, { color: colors.textSecondary }]}>
                      {activePendingRequest.attester_signatures || 0} /{' '}
                      {nftType === 'citizen' ? '1' : '2'}
                    </Text>
                    <View style={[styles.progressBarTrack, { backgroundColor: colors.borderSecondary }]}>
                      <View
                        style={[
                          styles.progressBarFill,
                          { backgroundColor: colors.primary },
                          {
                            width: `${
                              ((activePendingRequest.attester_signatures || 0) /
                                (nftType === 'citizen' ? 1 : 2)) *
                              100
                            }%`,
                          },
                        ]}
                      />
                    </View>
                  </View>
                </View>

                {nftType === 'citizen' && (
                  <View style={styles.progressItem}>
                    <Text style={[styles.progressLabel, { color: colors.textPrimary }]}>Bürger</Text>
                    <View style={styles.progressBar}>
                      <Text style={[styles.progressText, { color: colors.textSecondary }]}>
                        {activePendingRequest.citizen_signatures || 0} / 1
                      </Text>
                      <View style={[styles.progressBarTrack, { backgroundColor: colors.borderSecondary }]}>
                        <View
                          style={[
                            styles.progressBarFill,
                            { backgroundColor: colors.primary },
                            {
                              width: `${
                                Math.min((activePendingRequest.citizen_signatures || 0) * 100, 100)
                              }%`,
                            },
                          ]}
                        />
                      </View>
                    </View>
                  </View>
                )}
              </View>

              <Text style={[styles.progressHint, { color: colors.textTertiary }]}>
                &#x2139;&#xFE0F; Sie benötigen{' '}
                {nftType === 'citizen'
                  ? '1 Bescheiniger und 1 Bürger (mindestens 2 verschiedene Personen)'
                  : '2 Bescheiniger (mindestens 2 verschiedene Personen)'}
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Inter-Medium',
  },
  content: {
    flex: 1,
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
  statusBanner: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#fbbf24',
    borderRadius: 12,
    padding: 16,
    margin: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  statusTextContainer: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#d97706',
    marginBottom: 4,
  },
  statusSubtitle: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    lineHeight: 18,
  },
  progressSection: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
    marginBottom: 12,
  },
  progressCard: {
    borderRadius: 12,
    padding: 16,
    gap: 16,
  },
  progressItem: {
    gap: 8,
  },
  progressLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  progressBar: {
    gap: 6,
  },
  progressText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
  progressBarTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressHint: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginTop: 8,
  },
  dataSection: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  dataCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dataLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#2E7D32',
  },
  dataValue: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#1B5E20',
    flex: 1,
    textAlign: 'right',
  },
  dataHint: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    color: '#388E3C',
    marginTop: 8,
  },
  metadataSection: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  metadataCard: {
    borderRadius: 12,
    padding: 16,
  },
  metadataLabel: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    marginBottom: 6,
  },
  metadataValue: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
  },
  qrSection: {
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 24,
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
