/**
 * Citizen Request Screen
 *
 * One-tap citizen attestation request — NO PII form. The app derives a
 * wallet-bound, non-reversible commitment and submits the on-chain request in
 * the background. Attesters verify the person socially (out-of-band); real
 * uniqueness is handled by the v2 thresholds + (Phase 2) Self.xyz.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useCreateCitizenRequest, REQUEST_STAGE_LABEL } from '@/hooks/useVerification';
import { useVerificationContext } from '@/context/VerificationContext';
import { useTheme } from '@/context/ThemeContext';
import ErrorDrawer from '@/components/ErrorDrawer';
import { InformationCircleIcon } from '@/components/Icons';

const DEFAULT_REASON = 'Bürger von Röbel';
// No personal data is collected. The commitment is derived purely from the
// wallet (deterministic salt over empty fields) → a unique, device-bound,
// non-reversible Nachweis per wallet. The preimage never leaves the device.
const DEFAULT_IDENTITY = { firstName: '', lastName: '', birthdate: '', address: '' };

export default function RequestCitizenScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { hasCitizenNFT, activePendingRequest, refresh } = useVerificationContext();
  const { createRequest, isLoading, stage } = useCreateCitizenRequest();

  const [errorDrawer, setErrorDrawer] = useState({ visible: false, message: '' });

  const lockIcon = require('@/assets/illustration/small/encryption.png');

  const handleSubmit = async () => {
    try {
      const result = await createRequest(DEFAULT_IDENTITY, DEFAULT_REASON);
      await refresh();
      router.replace({
        pathname: '/verification/request-citizen/success' as any,
        params: { requestId: String(result.requestId) },
      });
    } catch (error) {
      console.error('Failed to create request:', error);
      setErrorDrawer({
        visible: true,
        message:
          error instanceof Error
            ? error.message
            : 'Der Antrag konnte nicht erstellt werden. Bitte versuchen Sie es erneut.',
      });
    }
  };

  if (hasCitizenNFT) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.messageContainer}>
          <Text style={[styles.messageTitle, { color: colors.textPrimary }]}>&#x2713; Bereits verifiziert</Text>
          <Text style={[styles.messageText, { color: colors.textSecondary }]}>Sie sind bereits ein verifizierter Bürger.</Text>
          <Pressable style={[styles.button, { backgroundColor: colors.primary }]} onPress={() => router.back()}>
            <Text style={[styles.buttonText, { color: colors.onPrimary }]}>Zurück</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (activePendingRequest) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.messageContainer}>
          <Text style={[styles.messageTitle, { color: colors.textPrimary }]}>&#x23F3; Antrag ausstehend</Text>
          <Text style={[styles.messageText, { color: colors.textSecondary }]}>Sie haben bereits einen ausstehenden Antrag.</Text>
          <Pressable
            style={[styles.button, { backgroundColor: colors.primary }]}
            onPress={() => router.replace('/verification/my-request' as any)}
          >
            <Text style={[styles.buttonText, { color: colors.onPrimary }]}>Meinen Antrag anzeigen</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.closeButton}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Schließen"
        >
          <Ionicons name="close" size={28} color={colors.textPrimary} />
        </Pressable>
      </View>

      <View style={styles.body}>
        <Image source={lockIcon} style={styles.lockIcon} resizeMode="contain" accessibilityIgnoresInvertColors />
        <Text style={[styles.title, { color: colors.textPrimary }]}>Bürger werden</Text>
        <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
          Kein Formular nötig. Mit einem Tap erstellen wir einen anonymen, nur auf Ihrem Gerät gebundenen Nachweis und senden Ihren Antrag automatisch. Es werden keine persönlichen Daten erfasst — die Bestätiger aus Röbel verifizieren Sie persönlich.
        </Text>

        <View style={styles.infoBanner}>
          <View style={[styles.infoIconCircle, { backgroundColor: colors.surface }]}>
            <InformationCircleIcon size={18} color={colors.primary} />
          </View>
          <Text style={[styles.infoText, { color: colors.textPrimary }]}>
            Nach dem Antrag erhalten Sie einen QR-Code um Signaturen einzusammeln.
          </Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Pressable
          style={[styles.submitButton, { backgroundColor: colors.primary }, isLoading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={isLoading}
          accessibilityRole="button"
        >
          {isLoading ? (
            <View style={styles.submitButtonContent}>
              <ActivityIndicator color={colors.onPrimary} />
              <Text style={[styles.submitButtonText, { color: colors.onPrimary }]}>
                {REQUEST_STAGE_LABEL[stage === 'idle' ? 'encrypting' : stage]}
              </Text>
            </View>
          ) : (
            <Text style={[styles.submitButtonText, { color: colors.onPrimary }]}>
              {REQUEST_STAGE_LABEL.idle}
            </Text>
          )}
        </Pressable>
      </View>

      <ErrorDrawer
        visible={errorDrawer.visible}
        message={errorDrawer.message}
        onDismiss={() => setErrorDrawer({ visible: false, message: '' })}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    height: 56,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  lockIcon: {
    width: 56,
    height: 56,
    marginBottom: 16,
  },
  title: {
    fontFamily: 'Inter-Medium',
    fontSize: 26,
    marginBottom: 10,
  },
  bodyText: {
    fontFamily: 'Inter-Regular',
    fontSize: 15,
    lineHeight: 22,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 24,
    paddingVertical: 12,
  },
  infoIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoText: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    lineHeight: 19,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    paddingTop: 8,
  },
  submitButton: {
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  submitButtonText: {
    fontFamily: 'Inter-Medium',
    fontSize: 16,
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
