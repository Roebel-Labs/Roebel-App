// Step 3 — Bank details (IBAN + optional BIC + account holder).

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import { usePartnerRegisterWizard } from '@/context/PartnerRegisterWizardContext';
import { isValidIban, formatIban, normalizeIban } from '@/lib/iban';
import WizardFooter from '@/components/WizardFooter';

const BIC_REGEX = /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/;

export default function PartnerRegisterBankScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { ownedAccounts } = useAccount();
  const { state, dispatch } = usePartnerRegisterWizard();

  const selectedAccount = ownedAccounts.find((a) => a.id === state.selectedAccountId);

  const [iban, setIban] = useState(state.iban);
  const [bic, setBic] = useState(state.bic);
  const [accountHolder, setAccountHolder] = useState(
    state.accountHolder || selectedAccount?.name || '',
  );
  const [ibanTouched, setIbanTouched] = useState(false);

  // Pre-fill account holder once the account is known.
  useEffect(() => {
    if (!state.accountHolder && selectedAccount?.name) {
      setAccountHolder(selectedAccount.name);
    }
  }, [selectedAccount, state.accountHolder]);

  const normalizedIban = normalizeIban(iban);
  const ibanValid = isValidIban(normalizedIban);
  const bicTrimmed = bic.trim().toUpperCase();
  const bicValid = bicTrimmed === '' || BIC_REGEX.test(bicTrimmed);
  const accountHolderValid = accountHolder.trim().length > 0;
  const canContinue = ibanValid && bicValid && accountHolderValid;

  const handleNext = () => {
    if (!canContinue) return;
    dispatch({
      type: 'SET_BANK',
      payload: {
        iban: normalizedIban,
        bic: bicTrimmed,
        accountHolder: accountHolder.trim(),
      },
    });
    router.push('/roebel-card/partner-register/agreement' as any);
  };

  return (
    <SafeAreaView edges={['bottom']} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <Text style={[styles.stepLabel, { color: colors.textTertiary }]}>Schritt 3 von 5</Text>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Bankverbindung</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Wir zahlen deine Umsätze monatlich auf dein Konto aus. Innerhalb der ersten fünf
          Bankarbeitstage des Folgemonats.
        </Text>

        <Text style={[styles.label, { color: colors.textSecondary }]}>IBAN *</Text>
        <TextInput
          value={iban}
          onChangeText={(v) => {
            setIban(v);
            if (!ibanTouched) setIbanTouched(true);
          }}
          onBlur={() => setIbanTouched(true)}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="DE89 3704 0044 0532 0130 00"
          placeholderTextColor={colors.textTertiary}
          style={[
            styles.textInput,
            {
              borderColor:
                ibanTouched && !ibanValid
                  ? colors.error ?? '#DC2626'
                  : colors.border,
              backgroundColor: colors.surface,
              color: colors.textPrimary,
            },
          ]}
        />
        {ibanTouched && !ibanValid && iban.length > 0 && (
          <Text style={[styles.helperError, { color: colors.error ?? '#DC2626' }]}>
            Ungültige IBAN
          </Text>
        )}
        {ibanValid && (
          <Text style={[styles.helper, { color: colors.textTertiary }]}>
            {formatIban(normalizedIban)}
          </Text>
        )}

        <Text style={[styles.label, { color: colors.textSecondary, marginTop: 24 }]}>BIC</Text>
        <TextInput
          value={bic}
          onChangeText={setBic}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="BYLADEM1MLM"
          placeholderTextColor={colors.textTertiary}
          style={[
            styles.textInput,
            {
              borderColor: !bicValid ? colors.error ?? '#DC2626' : colors.border,
              backgroundColor: colors.surface,
              color: colors.textPrimary,
            },
          ]}
        />
        <Text style={[styles.helper, { color: colors.textTertiary }]}>
          Freiwillig. Für deutsche IBANs nicht erforderlich.
        </Text>

        <Text style={[styles.label, { color: colors.textSecondary, marginTop: 24 }]}>
          Kontoinhaber *
        </Text>
        <TextInput
          value={accountHolder}
          onChangeText={setAccountHolder}
          placeholder="Firmenname oder Inhabername"
          placeholderTextColor={colors.textTertiary}
          style={[
            styles.textInput,
            {
              borderColor: colors.border,
              backgroundColor: colors.surface,
              color: colors.textPrimary,
            },
          ]}
        />
        <Text style={[styles.helper, { color: colors.textTertiary }]}>
          Vorausgefüllt aus deinem Unternehmen. Du kannst ihn überschreiben, falls das
          Auszahlungskonto auf einen anderen Namen läuft.
        </Text>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      <WizardFooter
        step={3}
        totalSteps={5}
        onBack={() => router.back()}
        onNext={handleNext}
        nextDisabled={!canContinue}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scrollView: { flex: 1, paddingHorizontal: 24, paddingTop: 24 },
  stepLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: { fontSize: 26, fontFamily: 'Inter-Bold', marginBottom: 8 },
  subtitle: { fontSize: 15, fontFamily: 'Inter-Regular', marginBottom: 32 },
  label: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  textInput: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 15,
    fontFamily: 'Inter-Regular',
  },
  helper: {
    marginTop: 6,
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
  helperError: {
    marginTop: 6,
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
  bottomSpacer: { height: 96 },
});
