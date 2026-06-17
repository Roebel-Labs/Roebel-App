/**
 * Complete Citizen Data Screen
 *
 * For an ALREADY-verified citizen (e.g. bulk-minted during the Gnosis migration)
 * to add the personal details that were intentionally NOT carried over. Stores a
 * commitment preimage on-device only — no on-chain tx, no server PII. Explains
 * to the user WHY this is worth doing (and that their status is not at risk).
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import { useTheme } from '@/context/ThemeContext';
import { germanDateToIso, enrollExistingCitizen } from '@/lib/citizen-commitment';
import ErrorDrawer from '@/components/ErrorDrawer';
import { InformationCircleIcon } from '@/components/Icons';

export default function CompleteCitizenDataScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const account = useActiveAccount();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [address, setAddress] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorDrawer, setErrorDrawer] = useState({ visible: false, message: '' });

  const lockIcon = require('@/assets/illustration/small/encryption.png');

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

    setIsSaving(true);
    try {
      await enrollExistingCitizen(
        { firstName: firstName.trim(), lastName: lastName.trim(), birthdate: iso, address: address.trim() },
        account
      );
      // Returning to the profile (where the banner is now gone) confirms success.
      router.back();
    } catch (error) {
      console.error('Failed to complete citizen data:', error);
      setErrorDrawer({
        visible: true,
        message: error instanceof Error ? error.message : 'Die Angaben konnten nicht gespeichert werden. Bitte versuchen Sie es erneut.',
      });
    } finally {
      setIsSaving(false);
    }
  };

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
          <Text style={[styles.privacyTitle, { color: colors.textPrimary }]}>Angaben vervollständigen</Text>
          <Text style={[styles.privacyBody, { color: colors.textSecondary }]}>
            Ihre Angaben bleiben auf Ihrem Gerät. Gespeichert wird nur ein nicht umkehrbarer Fingerabdruck — niemand kann daraus Ihren Namen lesen.
          </Text>
        </View>

        {/* WHY: explain why an already-verified citizen should do this */}
        <View style={[styles.whyCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.whyTitle, { color: colors.textPrimary }]}>Warum sollte ich das tun?</Text>
          <Text style={[styles.whyBody, { color: colors.textSecondary }]}>
            Bei der Umstellung auf das neue System wurde Ihr Bürger-Status automatisch übernommen — Ihre persönlichen Angaben aber bewusst nicht mitkopiert, um Ihre Daten zu schützen.{'\n\n'}
            Wenn Sie sie jetzt ergänzen, ermöglicht das:
          </Text>
          <View style={styles.whyList}>
            <Text style={[styles.whyItem, { color: colors.textSecondary }]}>• Ihre eigenen Angaben in der App zu sehen</Text>
            <Text style={[styles.whyItem, { color: colors.textSecondary }]}>• eine schnellere Bewerbung als Bescheiniger (automatisch vorausgefüllt)</Text>
            <Text style={[styles.whyItem, { color: colors.textSecondary }]}>• kommende Datenschutz-Funktionen — z. B. anonym zu beweisen, dass Sie eine echte, volljährige Person sind, ohne Ihren Namen preiszugeben</Text>
          </View>
          <Text style={[styles.whyBody, { color: colors.textSecondary }]}>
            Ihr Bürger-Status bleibt unverändert — Sie sind weiterhin voll verifiziert, ob Sie dies ausfüllen oder nicht.
          </Text>
        </View>

        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Vorname *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.borderSecondary, color: colors.textPrimary }]}
            placeholder="Anna"
            placeholderTextColor={colors.textTertiary}
            value={firstName}
            onChangeText={setFirstName}
            editable={!isSaving}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Nachname *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.borderSecondary, color: colors.textPrimary }]}
            placeholder="Müller"
            placeholderTextColor={colors.textTertiary}
            value={lastName}
            onChangeText={setLastName}
            editable={!isSaving}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Geburtsdatum (TT.MM.JJJJ) *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.borderSecondary, color: colors.textPrimary }]}
            placeholder="05.03.1990"
            placeholderTextColor={colors.textTertiary}
            value={birthdate}
            onChangeText={setBirthdate}
            editable={!isSaving}
            keyboardType="numbers-and-punctuation"
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Adresse in Röbel/Müritz *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.borderSecondary, color: colors.textPrimary }]}
            placeholder="Musterstraße 123, 17207 Röbel"
            placeholderTextColor={colors.textTertiary}
            value={address}
            onChangeText={setAddress}
            editable={!isSaving}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.infoBanner}>
          <View style={[styles.infoIconCircle, { backgroundColor: colors.surface }]}>
            <InformationCircleIcon size={18} color={colors.primary} />
          </View>
          <Text style={[styles.infoText, { color: colors.textPrimary }]}>
            Beim Speichern werden Sie einmal um eine Signatur gebeten, damit nur Sie diese Angaben entsperren können.
          </Text>
        </View>
      </KeyboardAwareScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.submitButton, { backgroundColor: colors.primary }, isSaving && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={isSaving}
          accessibilityRole="button"
        >
          {isSaving ? (
            <View style={styles.submitButtonContent}>
              <ActivityIndicator color={colors.onPrimary} />
              <Text style={[styles.submitButtonText, { color: colors.onPrimary }]}>Angaben werden gesichert</Text>
            </View>
          ) : (
            <Text style={[styles.submitButtonText, { color: colors.onPrimary }]}>Speichern</Text>
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
    marginBottom: 20,
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
  whyCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    gap: 10,
  },
  whyTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
  },
  whyBody: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    lineHeight: 21,
  },
  whyList: {
    gap: 8,
  },
  whyItem: {
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
    fontFamily: 'Inter-Medium',
    fontSize: 16,
  },
});
