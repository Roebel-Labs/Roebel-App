import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import { isStripeConnectEnabled } from '@/lib/supabase-app-settings';
import { connectOnboard, connectStatus, openConnectOnboarding, type ConnectStatus } from '@/lib/stripe-connect';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import ConnectOnboardingModal from '@/components/payments/ConnectOnboardingModal';
import { isStripeNativeAvailable } from '@/lib/stripe-native';

/** Known `currently_due` keys mapped to German labels; anything else falls back to the raw key. */
const CURRENTLY_DUE_LABELS: Record<string, string> = {
  external_account: 'Bankkonto (IBAN)',
  'individual.verification.document': 'Ausweis- oder Registerdokument',
  'company.verification.document': 'Ausweis- oder Registerdokument',
  'tos_acceptance.date': 'Stripe-Nutzungsbedingungen',
};

function currentlyDueLabel(key: string): string {
  return CURRENTLY_DUE_LABELS[key] ?? key;
}

export default function OrgPaymentsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { activeAccount, roleInActiveAccount } = useAccount();
  const thirdwebAccount = useActiveAccount();

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [onboarding, setOnboarding] = useState(false);
  // In-app Stripe onboarding (native SDK builds); older binaries use the hosted browser flow.
  const [nativeOnboardingOpen, setNativeOnboardingOpen] = useState(false);

  const canManage = roleInActiveAccount === 'owner' || roleInActiveAccount === 'admin';

  // Guard: this screen is only valid for org accounts.
  useEffect(() => {
    if (!activeAccount || activeAccount.account_type !== 'organisation') {
      router.replace('/profile');
    }
  }, [activeAccount, router]);

  const load = useCallback(async () => {
    if (!activeAccount || activeAccount.account_type !== 'organisation') return;
    setRefreshing(true);
    try {
      const on = await isStripeConnectEnabled({ walletAddress: thirdwebAccount?.address ?? null });
      setEnabled(on);
      if (!on || !thirdwebAccount) {
        setStatus(null);
        return;
      }
      const result = await connectStatus(thirdwebAccount, activeAccount.id);
      if (result.ok) {
        setStatus(result.data);
      } else {
        Alert.alert('Fehler', result.message);
      }
    } finally {
      setRefreshing(false);
    }
  }, [activeAccount?.id, activeAccount?.account_type, thirdwebAccount]);

  // Re-check on mount and every time the screen regains focus — covers the
  // return from the Stripe onboarding browser sheet via the roebel:// deep link.
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const handleOnboard = useCallback(async () => {
    if (!activeAccount || !thirdwebAccount || onboarding) return;
    if (isStripeNativeAvailable()) {
      setNativeOnboardingOpen(true);
      return;
    }
    setOnboarding(true);
    try {
      const result = await connectOnboard(thirdwebAccount, activeAccount.id);
      if (!result.ok) {
        Alert.alert('Fehler', result.message);
        return;
      }
      await openConnectOnboarding(result.data.url);
      await load();
    } catch (err) {
      Alert.alert('Fehler', err instanceof Error ? err.message : 'Etwas ist schiefgelaufen.');
    } finally {
      setOnboarding(false);
    }
  }, [activeAccount, thirdwebAccount, onboarding, load]);

  const handleNativeClose = useCallback(() => {
    setNativeOnboardingOpen(false);
    void load();
  }, [load]);

  const handleNativeError = useCallback((message: string) => {
    setNativeOnboardingOpen(false);
    Alert.alert('Fehler', message);
  }, []);

  if (!activeAccount || activeAccount.account_type !== 'organisation') {
    return null;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={8}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Zahlungen</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} showsVerticalScrollIndicator={false}>
        {enabled === null && (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}

        {enabled === true && refreshing && (
          <View style={styles.refreshRow}>
            <ActivityIndicator size="small" color={colors.textTertiary} />
            <Text style={[styles.refreshText, { color: colors.textTertiary }]}>Aktualisiere…</Text>
          </View>
        )}

        {enabled === false && (
          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
              Zahlungen sind für dieses Konto noch nicht freigeschaltet.
            </Text>
          </View>
        )}

        {enabled === true && (
          <>
            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Stripe-Konto</Text>
                {status?.charges_enabled && (
                  <View style={[styles.pill, { backgroundColor: colors.successBackground }]}>
                    <Text style={[styles.pillText, { color: colors.success }]}>Aktiv</Text>
                  </View>
                )}
              </View>

              {!status?.connected && (
                <>
                  <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
                    Verkaufe Tickets für deine Veranstaltungen. Das Geld landet direkt auf dem
                    Stripe-Konto deiner Organisation. Stripe prüft die Organisation
                    (Vereinsregisterauszug, Vorstand mit Ausweis, IBAN auf den Verein). Die Angaben gehen
                    verschlüsselt direkt an Stripe und werden nicht bei der Röbel App gespeichert.
                  </Text>
                  {canManage && (
                    <Pressable
                      onPress={handleOnboard}
                      disabled={onboarding}
                      style={({ pressed }) => [
                        styles.primaryButton,
                        { backgroundColor: colors.primary, opacity: pressed || onboarding ? 0.85 : 1 },
                      ]}
                    >
                      {onboarding ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <Text style={styles.primaryButtonText}>Mit Stripe einrichten</Text>
                      )}
                    </Pressable>
                  )}
                </>
              )}

              {status?.connected && !status.charges_enabled && (
                <>
                  <Text style={[styles.sectionBody, { color: colors.textPrimary }]}>In Prüfung</Text>
                  {status.currently_due.length > 0 && (
                    <View style={styles.dueList}>
                      {status.currently_due.map((key) => (
                        <Text key={key} style={[styles.dueItem, { color: colors.textSecondary }]}>
                          •  {currentlyDueLabel(key)}
                        </Text>
                      ))}
                    </View>
                  )}
                  {canManage && (
                    <Pressable
                      onPress={handleOnboard}
                      disabled={onboarding}
                      style={({ pressed }) => [
                        styles.primaryButton,
                        { backgroundColor: colors.primary, opacity: pressed || onboarding ? 0.85 : 1 },
                      ]}
                    >
                      {onboarding ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <Text style={styles.primaryButtonText}>Angaben vervollständigen</Text>
                      )}
                    </Pressable>
                  )}
                </>
              )}

              {status?.charges_enabled && (
                <>
                  <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
                    Zahlungen möglich. Auszahlungen: {status.payouts_enabled ? 'aktiv' : 'ausstehend'}
                  </Text>
                  <Text style={[styles.hint, { color: colors.textTertiary }]}>
                    Verwalten kannst du dein Konto unter dashboard.stripe.com
                  </Text>
                </>
              )}
            </View>

            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Gebühren</Text>
              <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
                Stripe berechnet 1,5 % + 0,25 € pro Kartenzahlung. Die Röbel App behält eine
                kleine Plattformgebühr (2 % + 0,10 €) pro Bestellung ein. Bei Erstattungen bekommt
                der Käufer den vollen Betrag zurück.
              </Text>
            </View>

            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Einlass</Text>
              <Pressable
                onPress={() => router.push('/org/scan-tickets' as any)}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  { borderColor: colors.primary, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>Tickets scannen</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
      {thirdwebAccount && (
        <ConnectOnboardingModal
          visible={nativeOnboardingOpen}
          accountId={activeAccount.id}
          signer={thirdwebAccount}
          onClose={handleNativeClose}
          onError={handleNativeError}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 18, fontFamily: 'MonaSansSemiCondensed-SemiBold' },
  headerSpacer: { width: 32 },
  content: { flex: 1 },
  contentInner: { padding: 16, gap: 16 },
  loadingBox: { paddingVertical: 40, alignItems: 'center' },
  refreshRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 4 },
  refreshText: { fontSize: 12, fontFamily: 'Inter-Regular' },
  section: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 16, fontFamily: 'MonaSansSemiCondensed-SemiBold' },
  sectionBody: { fontSize: 13, fontFamily: 'Inter-Regular', lineHeight: 18 },
  hint: { fontSize: 12, fontFamily: 'Inter-Regular', lineHeight: 17 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pillText: { fontSize: 12, fontFamily: 'Inter-SemiBold' },
  dueList: { gap: 4 },
  dueItem: { fontSize: 13, fontFamily: 'Inter-Regular', lineHeight: 18 },
  primaryButton: {
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontFamily: 'MonaSansSemiCondensed-Bold' },
  secondaryButton: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButtonText: { fontSize: 14, fontFamily: 'MonaSansSemiCondensed-Bold' },
});
