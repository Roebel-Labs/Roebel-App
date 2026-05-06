/**
 * Citizen Request Form Screen
 *
 * Form for users to create a citizen attestation request
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import { useCreateCitizenRequest } from '@/hooks/useVerification';
import { useVerificationContext } from '@/context/VerificationContext';
import { useTheme } from '@/context/ThemeContext';
import RequestSuccessModal from '@/components/RequestSuccessModal';
import ErrorDrawer from '@/components/ErrorDrawer';
import { InformationCircleIcon } from '@/components/Icons';

const DEFAULT_REASON = 'Bürger in Röbel';

export default function RequestCitizenScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const account = useActiveAccount();
  const { hasCitizenNFT, activePendingRequest, refresh } = useVerificationContext();
  const { createRequest, isLoading } = useCreateCitizenRequest();

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdRequestId, setCreatedRequestId] = useState<number | null>(null);

  const [errorDrawer, setErrorDrawer] = useState({ visible: false, message: '' });

  const certImage = isDark
    ? require('@/assets/illustration/onboarding/cert-dark-mode.png')
    : require('@/assets/illustration/onboarding/cert-light-mode.png');

  const handleSubmit = async () => {
    if (!name.trim()) {
      setErrorDrawer({ visible: true, message: 'Bitte geben Sie Ihren Namen ein.' });
      return;
    }

    if (!address.trim()) {
      setErrorDrawer({ visible: true, message: 'Bitte geben Sie Ihre Adresse ein.' });
      return;
    }

    if (!account) {
      setErrorDrawer({ visible: true, message: 'Bitte verbinden Sie Ihre Wallet.' });
      return;
    }

    try {
      const result = await createRequest(
        { name: name.trim(), address: address.trim() },
        DEFAULT_REASON
      );

      await refresh();

      setCreatedRequestId(result.requestId);
      setShowSuccessModal(true);
    } catch (error) {
      console.error('Failed to create request:', error);
      setErrorDrawer({
        visible: true,
        message: error instanceof Error ? error.message : 'Der Antrag konnte nicht erstellt werden. Bitte versuchen Sie es erneut.'
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

      <KeyboardAwareScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid={true}
        enableAutomaticScroll={true}
        extraScrollHeight={100}
        extraHeight={150}
      >
        <View style={styles.privacyHeader}>
          <Image source={certImage} style={styles.certImage} resizeMode="contain" accessibilityIgnoresInvertColors />
          <View style={styles.privacyText}>
            <Text style={[styles.privacyTitle, { color: colors.textPrimary }]}>Datenschutz</Text>
            <Text style={[styles.privacyBody, { color: colors.textSecondary }]}>
              Ihr Name und Adresse werden mit Ende-zu-Ende-Verschlüsselung gesichert. Nur Sie können diese Daten später sehen.
            </Text>
          </View>
        </View>

        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Vollständiger Name *</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.background,
                borderColor: colors.borderSecondary,
                color: colors.textPrimary,
              },
            ]}
            placeholder="Max Mustermann"
            placeholderTextColor={colors.textTertiary}
            value={name}
            onChangeText={setName}
            editable={!isLoading}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Adresse in Röbel/Müritz *</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.background,
                borderColor: colors.borderSecondary,
                color: colors.textPrimary,
              },
            ]}
            placeholder="Musterstraße 123, 17207 Röbel"
            placeholderTextColor={colors.textTertiary}
            value={address}
            onChangeText={setAddress}
            editable={!isLoading}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.infoBanner}>
          <View style={[styles.infoIconCircle, { backgroundColor: colors.surface }]}>
            <InformationCircleIcon size={18} color={colors.primary} />
          </View>
          <Text style={[styles.infoText, { color: colors.textPrimary }]}>
            Nach dem Antrag erhalten Sie einen QR-Code um Signaturen einzusammeln.
          </Text>
        </View>
      </KeyboardAwareScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.submitButton, { backgroundColor: colors.primary }, isLoading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={isLoading}
          accessibilityRole="button"
        >
          {isLoading ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={[styles.submitButtonText, { color: colors.onPrimary }]}>Absenden</Text>
          )}
        </Pressable>
      </View>

      <RequestSuccessModal
        visible={showSuccessModal}
        requestId={createdRequestId}
        onViewQR={() => {
          setShowSuccessModal(false);
          router.replace('/verification/my-request' as any);
        }}
        onDismiss={() => {
          setShowSuccessModal(false);
          router.back();
        }}
      />

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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  privacyHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    marginTop: 8,
    marginBottom: 32,
  },
  certImage: {
    width: 64,
    height: 64,
  },
  privacyText: {
    flex: 1,
  },
  privacyTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 22,
    marginBottom: 6,
  },
  privacyBody: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    lineHeight: 20,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontFamily: 'Inter-Regular',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 8,
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
    fontSize: 15,
    lineHeight: 22,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    paddingTop: 8,
  },
  submitButton: {
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontFamily: 'Inter-SemiBold',
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
