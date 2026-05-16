/**
 * My Request Screen
 *
 * Displays user's active pending verification request with QR code
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useVerificationContext } from '@/context/VerificationContext';
import { useRequestDetails } from '@/hooks/useVerification';
import { useTheme } from '@/context/ThemeContext';
import VerificationQRCode from '@/components/VerificationQRCode';

export default function MyRequestScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { activePendingRequest, hasCitizenNFT, refresh } = useVerificationContext();
  const [refreshing, setRefreshing] = useState(false);

  const requestId = activePendingRequest?.request_id;
  const nftType = activePendingRequest?.nft_type || activePendingRequest?.contract_type || 'citizen';

  const { decryptedData, isLoading, fetchRequest } = useRequestDetails(
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

  if (!activePendingRequest) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
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
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Zurück"
        >
          <Ionicons name="chevron-back" size={28} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Antrag</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
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
            <View style={styles.qrSection}>
              <VerificationQRCode
                requestId={requestId as number}
                nftType={nftType}
                attesterCount={activePendingRequest.attester_signatures || 0}
                citizenCount={activePendingRequest.citizen_signatures || 0}
              />
            </View>

            {decryptedData && (
              <View style={styles.privateDataCard}>
                <View style={styles.privateRow}>
                  <Text style={styles.privateLabel}>Name:</Text>
                  <Text style={styles.privateValue}>{decryptedData.name}</Text>
                </View>
                <View style={styles.privateRow}>
                  <Text style={styles.privateLabel}>Adresse:</Text>
                  <Text style={styles.privateValue}>{decryptedData.address}</Text>
                </View>
                <View style={styles.privateDisclaimerRow}>
                  <Ionicons name="lock-closed" size={12} color="#9aa0a6" />
                  <Text style={styles.privateDisclaimer}>
                    Diese Daten sind verschlüsselt. Nur Sie können Sie sehen.
                  </Text>
                </View>
              </View>
            )}
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
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontFamily: 'Inter-SemiBold',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 44,
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
    marginBottom: 16,
  },
  privateDataCard: {
    backgroundColor: '#0f1011',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginTop: 8,
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
    color: '#e8eaed',
  },
  privateValue: {
    fontFamily: 'GeistMono-Regular',
    fontSize: 13,
    color: '#ffffff',
    textAlign: 'right',
    flex: 1,
    marginLeft: 12,
  },
  privateDisclaimerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: 10,
  },
  privateDisclaimer: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: '#9aa0a6',
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
    fontFamily: 'Inter-SemiBold',
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
    fontFamily: 'Inter-SemiBold',
  },
});
