/**
 * Attester (Bescheiniger) Request Form Screen
 *
 * Lets an existing Bürger (Citizen) apply to become a Bescheiniger. Mirrors the
 * citizen request form: name + address are encrypted (V2) and an on-chain
 * attestation request is created. Name/address are pre-filled from the user's
 * existing citizen request (decrypted client-side, no signature prompt). The
 * submit button is stage-aware (encrypting → uploading → …).
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import { useCreateAttesterRequest, REQUEST_STAGE_LABEL } from '@/hooks/useVerification';
import { useVerificationContext } from '@/context/VerificationContext';
import { useTheme } from '@/context/ThemeContext';
import { loadCitizenPreimage, germanDateToIso } from '@/lib/citizen-commitment';
import ErrorDrawer from '@/components/ErrorDrawer';
import { InformationCircleIcon } from '@/components/Icons';

const DEFAULT_REASON = 'Bescheiniger in Röbel';

export default function RequestAttesterScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const account = useActiveAccount();
  const { hasCitizenNFT, hasAttesterNFT, refresh } = useVerificationContext();
  const { createRequest, isLoading, stage } = useCreateAttesterRequest();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [address, setAddress] = useState('');
  const [prefilling, setPrefilling] = useState(false);

  const [errorDrawer, setErrorDrawer] = useState({ visible: false, message: '' });

  const lockIcon = require('@/assets/illustration/small/encryption.png');

  // Prefill from the on-device citizen preimage (no decrypt, no network).
  useEffect(() => {
    let cancelled = false;
    async function prefill() {
      if (!account || !hasCitizenNFT) return;
      setPrefilling(true);
      try {
        const pre = await loadCitizenPreimage(account.address);
        if (cancelled || !pre) return;
        setFirstName((p) => p || pre.firstName || '');
        setLastName((p) => p || pre.lastName || '');
        // birthdate is stored ISO; show it back as DD.MM.YYYY
        if (pre.birthdate) {
          const [y, m, d] = pre.birthdate.split('-');
          if (y && m && d) setBirthdate((p) => p || `${d}.${m}.${y}`);
        }
        setAddress((p) => p || pre.address || '');
      } catch (err) {
        console.log('Prefill from citizen preimage skipped:', err);
      } finally {
        if (!cancelled) setPrefilling(false);
      }
    }
    prefill();
    return () => {
      cancelled = true;
    };
  }, [account, hasCitizenNFT]);

  const handleSubmit = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      setErrorDrawer({ visible: true, message: 'Bitte geben Sie Vor- und Nachnamen ein.' });
      return;
    }
    const iso = germanDateToIso(birthdate);
    if (!iso) {
      setErrorDrawer({ visible: true, message: 'Bitte geben Sie Ihr Geburtsdatum als TT.MM.JJJJ ein.' });
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
        { firstName: firstName.trim(), lastName: lastName.trim(), birthdate: iso, address: address.trim() },
        DEFAULT_REASON,
      );

      await refresh();

      router.replace({
        pathname: '/verification/request-attester/success' as any,
        params: { requestId: String(result.requestId) },
      });
    } catch (error) {
      console.error('Failed to create attester request:', error);
      setErrorDrawer({
        visible: true,
        message:
          error instanceof Error
            ? error.message
            : 'Der Antrag konnte nicht erstellt werden. Bitte versuchen Sie es erneut.',
      });
    }
  };

  // Already a Bescheiniger — nothing to do.
  if (hasAttesterNFT) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.messageContainer}>
          <Text style={[styles.messageTitle, { color: colors.textPrimary }]}>&#x2713; Bereits Bescheiniger</Text>
          <Text style={[styles.messageText, { color: colors.textSecondary }]}>
            Sie besitzen bereits einen Bescheiniger-Pass.
          </Text>
          <Pressable style={[styles.button, { backgroundColor: colors.primary }]} onPress={() => router.back()}>
            <Text style={[styles.buttonText, { color: colors.onPrimary }]}>Zurück</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // Only verified Bürger may apply to become Bescheiniger.
  if (!hasCitizenNFT) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.messageContainer}>
          <Text style={[styles.messageTitle, { color: colors.textPrimary }]}>Zuerst Bürger werden</Text>
          <Text style={[styles.messageText, { color: colors.textSecondary }]}>
            Nur verifizierte Bürger können Bescheiniger werden. Stellen Sie zuerst einen Bürger-Antrag.
          </Text>
          <Pressable
            style={[styles.button, { backgroundColor: colors.primary }]}
            onPress={() => router.replace('/verification/request-citizen' as any)}
          >
            <Text style={[styles.buttonText, { color: colors.onPrimary }]}>Bürger-Antrag stellen</Text>
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
          <Image source={lockIcon} style={styles.lockIcon} resizeMode="contain" accessibilityIgnoresInvertColors />
          <Text style={[styles.privacyTitle, { color: colors.textPrimary }]}>Bescheiniger werden</Text>
          <Text style={[styles.privacyBody, { color: colors.textSecondary }]}>
            Ihre Angaben bleiben auf Ihrem Gerät. Gespeichert wird nur ein nicht umkehrbarer Fingerabdruck — niemand kann daraus Ihren Namen lesen.
          </Text>
        </View>

        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Vorname *</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.background,
                borderColor: colors.borderSecondary,
                color: colors.textPrimary,
              },
            ]}
            placeholder="Anna"
            placeholderTextColor={colors.textTertiary}
            value={firstName}
            onChangeText={setFirstName}
            editable={!isLoading}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Nachname *</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.background,
                borderColor: colors.borderSecondary,
                color: colors.textPrimary,
              },
            ]}
            placeholder="Müller"
            placeholderTextColor={colors.textTertiary}
            value={lastName}
            onChangeText={setLastName}
            editable={!isLoading}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Geburtsdatum (TT.MM.JJJJ) *</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.background,
                borderColor: colors.borderSecondary,
                color: colors.textPrimary,
              },
            ]}
            placeholder="05.03.1990"
            placeholderTextColor={colors.textTertiary}
            value={birthdate}
            onChangeText={setBirthdate}
            editable={!isLoading}
            keyboardType="numbers-and-punctuation"
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
            {prefilling
              ? 'Daten aus Ihrem Bürgerantrag werden geladen …'
              : 'Nach dem Antrag erhalten Sie einen QR-Code, um zwei Bescheiniger-Unterschriften einzusammeln.'}
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  privacyHeader: {
    marginTop: 8,
    marginBottom: 28,
  },
  lockIcon: {
    width: 56,
    height: 56,
    marginBottom: 16,
  },
  privacyTitle: {
    fontFamily: 'Inter-Medium',
    fontSize: 26,
    marginBottom: 10,
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
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
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
    fontFamily: 'MonaSansSemiCondensed-Bold',
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
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
});
