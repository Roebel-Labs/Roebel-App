/**
 * Citizen Request Form Screen
 *
 * Form for users to create a citizen attestation request
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import { useCreateCitizenRequest } from '@/hooks/useVerification';
import { useVerificationContext } from '@/context/VerificationContext';
import { useTheme } from '@/context/ThemeContext';
import RequestSuccessModal from '@/components/RequestSuccessModal';
import ErrorDrawer from '@/components/ErrorDrawer';
import { ArrowLeftIcon } from '@/components/Icons';

export default function RequestCitizenScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const account = useActiveAccount();
  const { hasCitizenNFT, activePendingRequest, refresh } = useVerificationContext();
  const { createRequest, isLoading } = useCreateCitizenRequest();

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [reason, setReason] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdRequestId, setCreatedRequestId] = useState<number | null>(null);

  // Error drawer state
  const [errorDrawer, setErrorDrawer] = useState({ visible: false, message: '' });

  const handleSubmit = async () => {
    // Validation
    if (!name.trim()) {
      setErrorDrawer({ visible: true, message: 'Bitte geben Sie Ihren Namen ein.' });
      return;
    }

    if (!address.trim()) {
      setErrorDrawer({ visible: true, message: 'Bitte geben Sie Ihre Adresse ein.' });
      return;
    }

    if (!reason.trim()) {
      setErrorDrawer({ visible: true, message: 'Bitte geben Sie einen Grund an.' });
      return;
    }

    if (!account) {
      setErrorDrawer({ visible: true, message: 'Bitte verbinden Sie Ihre Wallet.' });
      return;
    }

    try {
      // Create request
      const result = await createRequest(
        { name: name.trim(), address: address.trim() },
        reason.trim()
      );

      // Refresh context to update verification status (await to ensure data is loaded)
      await refresh();

      // Show custom success modal
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

  // Redirect if already verified
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

  // Redirect if already has pending request
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
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={[styles.backButton, { backgroundColor: colors.surface }]}>
          <ArrowLeftIcon size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Bürger-Pass</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAwareScrollView style={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" enableOnAndroid={true} enableAutomaticScroll={true} extraScrollHeight={100} extraHeight={150}>
        {/* Info Box */}
        <View style={[styles.infoBox, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}>
          <Text style={styles.infoTitle}>&#x1F4DD; Informationen</Text>
          <Text style={styles.infoText}>
            Um ein verifizierter Bürger zu werden, benötigen Sie:{'\n'}
            • 1 Bescheiniger-Unterschrift{'\n'}
            • 2 Bürger-Unterschriften{'\n\n'}
            Ihre persönlichen Daten (Name und Adresse) werden verschlüsselt gespeichert und nur Sie können sie entschlüsseln.
          </Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: colors.textPrimary }]}>Vollständiger Name *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.borderSecondary, color: colors.textPrimary }]}
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
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.borderSecondary, color: colors.textPrimary }]}
              placeholder="Musterstraße 123, 17207 Röbel"
              placeholderTextColor={colors.textTertiary}
              value={address}
              onChangeText={setAddress}
              editable={!isLoading}
              autoCapitalize="words"
              multiline
              numberOfLines={2}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: colors.textPrimary }]}>Grund für den Antrag *</Text>
            <TextInput
              style={[styles.input, styles.textArea, { backgroundColor: colors.surface, borderColor: colors.borderSecondary, color: colors.textPrimary }]}
              placeholder="Ich bin Bürger von Röbel/Müritz und möchte an der Stadtentwicklung teilnehmen."
              placeholderTextColor={colors.textTertiary}
              value={reason}
              onChangeText={setReason}
              editable={!isLoading}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            <Text style={[styles.hint, { color: colors.textTertiary }]}>
              Dieser Text ist öffentlich sichtbar für alle Bescheiniger und Bürger.
            </Text>
          </View>

          {/* Privacy Notice */}
          <View style={[styles.privacyBox, { backgroundColor: colors.successBackground, borderColor: colors.success }]}>
            <Text style={styles.privacyTitle}>&#x1F512; Datenschutz</Text>
            <Text style={styles.privacyText}>
              Ihr Name und Ihre Adresse werden mit Ende-zu-Ende-Verschlüsselung gesichert. Nur Sie können diese Daten entschlüsseln. Der Grund für Ihren Antrag ist öffentlich sichtbar.
            </Text>
          </View>

          {/* Submit Button */}
          <Pressable
            style={[styles.submitButton, { backgroundColor: colors.primary }, isLoading && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={[styles.submitButtonText, { color: colors.onPrimary }]}>Antrag einreichen</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAwareScrollView>

      {/* Success Modal */}
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

      {/* Error Drawer */}
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
  infoBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    margin: 16,
  },
  infoTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#1565C0',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#1976D2',
    lineHeight: 20,
  },
  form: {
    padding: 16,
  },
  formGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    fontSize: 15,
    fontFamily: 'Inter-Regular',
  },
  textArea: {
    minHeight: 100,
    paddingTop: 16,
  },
  hint: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginTop: 6,
  },
  privacyBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  privacyTitle: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#2E7D32',
    marginBottom: 8,
  },
  privacyText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: '#388E3C',
    lineHeight: 18,
  },
  submitButton: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 32,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
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
