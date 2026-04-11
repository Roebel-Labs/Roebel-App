// Step 5 — Review + submit.

import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import { usePartnerRegisterWizard } from '@/context/PartnerRegisterWizardContext';
import {
  createRoebelCardPartner,
  RECHTSFORM_LABELS,
} from '@/lib/supabase-roebel-card-partners';
import { maskIban } from '@/lib/iban';
import { buildAgreementMetadata } from '@/lib/roebel-card-agreement-metadata';
import WizardFooter from '@/components/WizardFooter';

export default function PartnerRegisterReviewScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { ownedAccounts } = useAccount();
  const { state, dispatch } = usePartnerRegisterWizard();
  const [submitting, setSubmitting] = useState(false);

  const selectedAccount = ownedAccounts.find((a) => a.id === state.selectedAccountId);

  const handleSubmit = async () => {
    if (
      !state.selectedAccountId ||
      !state.rechtsform ||
      !state.iban ||
      !state.accountHolder ||
      !state.agbAccepted ||
      !state.authorityAccepted
    ) {
      Alert.alert('Fehler', 'Bitte fülle alle Pflichtfelder aus.');
      return;
    }

    setSubmitting(true);
    dispatch({ type: 'SET_SUBMITTING', payload: true });

    try {
      const metadata = await buildAgreementMetadata({
        agbAccepted: state.agbAccepted,
        authorityAccepted: state.authorityAccepted,
      });

      const row = await createRoebelCardPartner({
        accountId: state.selectedAccountId,
        rechtsform: state.rechtsform,
        vatId: state.vatId.trim() || null,
        iban: state.iban,
        bic: state.bic.trim() || null,
        accountHolder: state.accountHolder.trim(),
        agreementMetadata: metadata,
      });

      dispatch({ type: 'SET_NEW_PARTNER_ID', payload: row.id });
      router.replace('/roebel-card/partner-register/success' as any);
    } catch (error: any) {
      console.error('Partner registration error:', error);
      Alert.alert(
        'Fehler',
        error?.message || 'Der Antrag konnte nicht eingereicht werden.',
      );
    } finally {
      setSubmitting(false);
      dispatch({ type: 'SET_SUBMITTING', payload: false });
    }
  };

  return (
    <SafeAreaView edges={['bottom']} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <Text style={[styles.stepLabel, { color: colors.textTertiary }]}>Schritt 5 von 5</Text>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Alles richtig?</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Prüfe deine Angaben, bevor du den Partnerantrag einreichst.
        </Text>

        <SectionCard
          title="Betrieb"
          onEdit={() => router.push('/roebel-card/partner-register/business' as any)}
          colors={colors}
        >
          <Text style={[styles.sectionValue, { color: colors.textPrimary }]}>
            {selectedAccount?.name ?? '—'}
          </Text>
          {state.rechtsform && (
            <Text style={[styles.sectionMeta, { color: colors.textSecondary }]}>
              {RECHTSFORM_LABELS[state.rechtsform]}
            </Text>
          )}
          {state.vatId ? (
            <Text style={[styles.sectionMeta, { color: colors.textTertiary }]}>
              USt-IdNr: {state.vatId}
            </Text>
          ) : null}
        </SectionCard>

        <SectionCard
          title="Bankverbindung"
          onEdit={() => router.push('/roebel-card/partner-register/bank' as any)}
          colors={colors}
        >
          <Text style={[styles.sectionValue, { color: colors.textPrimary }]}>
            {maskIban(state.iban)}
          </Text>
          {state.bic ? (
            <Text style={[styles.sectionMeta, { color: colors.textSecondary }]}>
              BIC: {state.bic}
            </Text>
          ) : null}
          <Text style={[styles.sectionMeta, { color: colors.textSecondary }]}>
            Kontoinhaber: {state.accountHolder}
          </Text>
        </SectionCard>

        <SectionCard
          title="Vereinbarung"
          onEdit={() => router.push('/roebel-card/partner-register/agreement' as any)}
          colors={colors}
        >
          <Text style={[styles.sectionValue, { color: colors.textPrimary }]}>
            AGB akzeptiert
          </Text>
          <Text style={[styles.sectionMeta, { color: colors.textSecondary }]}>
            Vertretungsberechtigung bestätigt
          </Text>
        </SectionCard>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      <WizardFooter
        step={5}
        totalSteps={5}
        onBack={() => router.back()}
        onNext={handleSubmit}
        nextLabel="Partnerantrag absenden"
        nextDisabled={submitting}
        nextContent={
          submitting ? <ActivityIndicator color={colors.onPrimary} /> : undefined
        }
      />
    </SafeAreaView>
  );
}

function SectionCard({
  title,
  children,
  onEdit,
  colors,
}: {
  title: string;
  children: React.ReactNode;
  onEdit: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <View style={[styles.sectionCard, { backgroundColor: colors.surface }]}>
      <View style={styles.sectionCardHeader}>
        <Text style={[styles.sectionCardTitle, { color: colors.textSecondary }]}>
          {title}
        </Text>
        <Pressable onPress={onEdit}>
          <Text style={[styles.sectionCardEdit, { color: colors.primary }]}>Bearbeiten</Text>
        </Pressable>
      </View>
      {children}
    </View>
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
  sectionCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  sectionCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionCardTitle: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionCardEdit: { fontSize: 13, fontFamily: 'Inter-Medium' },
  sectionValue: { fontSize: 15, fontFamily: 'Inter-Medium' },
  sectionMeta: { fontSize: 13, fontFamily: 'Inter-Regular', marginTop: 4 },
  bottomSpacer: { height: 96 },
});
