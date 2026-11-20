import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { useRouter, useFocusEffect } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import { isMollieEnabled, isStripeConnectEnabled } from '@/lib/supabase-app-settings';
import { connectOnboard, connectStatus, openConnectOnboarding, type ConnectStatus } from '@/lib/stripe-connect';
import {
  mollieOnboard, openPaymentsOnboarding, paymentsStatus,
  type PaymentProviderEntry, type PaymentProviderId, type PaymentsStatus,
} from '@/lib/payments';
import { canSignSilently } from '@/lib/signed-request';
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
  // Provider seam: Mollie (EU, default) and Stripe (US). Without the Mollie flag the screen is the
  // Stripe-only screen it always was.
  const [payStatus, setPayStatus] = useState<PaymentsStatus | null>(null);
  const [chosen, setChosen] = useState<PaymentProviderId | null>(null);
  const [mollieBusy, setMollieBusy] = useState(false);

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
      const wallet = thirdwebAccount?.address ?? null;
      const [stripeOn, mollieOn] = await Promise.all([
        isStripeConnectEnabled({ walletAddress: wallet }),
        isMollieEnabled({ walletAddress: wallet }),
      ]);
      setEnabled(stripeOn || mollieOn);
      if (!(stripeOn || mollieOn) || !thirdwebAccount) {
        setStatus(null);
        setPayStatus(null);
        return;
      }
      let stripeVisible = stripeOn;
      if (mollieOn) {
        const ps = await paymentsStatus(thirdwebAccount, activeAccount.id);
        if (ps.ok) {
          setPayStatus(ps.data);
          stripeVisible = ps.data.providers.some((p) => p.id === 'stripe');
        } else {
          setPayStatus(null);
          Alert.alert('Fehler', ps.message);
        }
      } else {
        setPayStatus(null);
      }
      if (!stripeVisible) {
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
  // On a passkey session a re-check on focus only runs without a fingerprint (cached API session
  // token); the first check always runs.
  const checkedFor = useRef<string | null>(null);
  useFocusEffect(useCallback(() => {
    const key = `${thirdwebAccount?.address ?? ''}:${activeAccount?.id ?? ''}`;
    if (checkedFor.current !== key) {
      checkedFor.current = key;
      void load();
      return;
    }
    void canSignSilently(thirdwebAccount).then((silent) => { if (silent) void load(); });
  }, [load, thirdwebAccount, activeAccount?.id]));

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

  const handleMollieOnboard = useCallback(async () => {
    if (!activeAccount || !thirdwebAccount || mollieBusy) return;
    setMollieBusy(true);
    try {
      const result = await mollieOnboard(thirdwebAccount, activeAccount.id);
      if (!result.ok) {
        Alert.alert('Fehler', result.message);
        return;
      }
      await openPaymentsOnboarding(result.data.url);
      await load();
    } catch (err) {
      Alert.alert('Fehler', err instanceof Error ? err.message : 'Etwas ist schiefgelaufen.');
    } finally {
      setMollieBusy(false);
    }
  }, [activeAccount, thirdwebAccount, mollieBusy, load]);

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

  // Which provider panel to show. Without the Mollie flag (payStatus null) it is always Stripe, as before.
  // Otherwise the provider checkout uses, else Stripe for orgs only connected there, else Mollie (default).
  const providers = payStatus?.providers ?? [];
  const mollie = providers.find((p) => p.id === 'mollie') ?? null;
  const defaultProvider: PaymentProviderId = !payStatus || !mollie
    ? 'stripe'
    : payStatus.active ?? (status?.connected && !mollie.connected ? 'stripe' : 'mollie');
  const selected: PaymentProviderId = chosen && providers.some((p) => p.id === chosen) ? chosen : defaultProvider;
  const activeName = providers.find((p) => p.id === payStatus?.active)?.name ?? null;
  const bothConnected = providers.length > 1 && providers.every((p) => p.connected);

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
            {providers.length > 1 && (
              <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Zahlungsanbieter</Text>
                {providers.map((p) => (
                  <ProviderOption
                    key={p.id}
                    entry={p}
                    selected={selected === p.id}
                    isDefault={p.id === 'mollie'}
                    onPress={() => setChosen(p.id)}
                  />
                ))}
                {bothConnected && activeName && (
                  <Text style={[styles.hint, { color: colors.textTertiary }]}>
                    Ticketverkäufe laufen über {activeName}.
                  </Text>
                )}
              </View>
            )}

            {selected === 'mollie' && mollie && (
              <MollieSection
                entry={mollie}
                canManage={canManage}
                busy={mollieBusy}
                onOnboard={handleMollieOnboard}
                onMoney={() => router.push('/org/money' as any)}
              />
            )}

            {selected === 'stripe' && (
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
                  {canManage && (
                    <Pressable
                      onPress={() => router.push('/org/money' as any)}
                      style={({ pressed }) => [
                        styles.primaryButton,
                        { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
                      ]}
                    >
                      <Text style={styles.primaryButtonText}>Einnahmen & Auszahlungen</Text>
                    </Pressable>
                  )}
                  <Text style={[styles.hint, { color: colors.textTertiary }]}>
                    Alles Weitere findest du jederzeit auch unter dashboard.stripe.com
                  </Text>
                </>
              )}
            </View>
            )}

            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Gebühren</Text>
              {selected === 'mollie' ? (
                <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
                  Mollie berechnet je nach Zahlart z. B. 1,8 % + 0,25 € pro Kartenzahlung. Die Röbel
                  App behält eine kleine Plattformgebühr (2 % + 0,10 €) pro Bestellung ein. Bei
                  Erstattungen bekommt der Käufer den vollen Betrag zurück; die Plattformgebühr
                  erstattet Mollie dabei nicht.
                </Text>
              ) : (
                <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
                  Stripe berechnet 1,5 % + 0,25 € pro Kartenzahlung. Die Röbel App behält eine
                  kleine Plattformgebühr (2 % + 0,10 €) pro Bestellung ein. Bei Erstattungen bekommt
                  der Käufer den vollen Betrag zurück.
                </Text>
              )}
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

function ProviderOption({ entry, selected, isDefault, onPress }: {
  entry: PaymentProviderEntry; selected: boolean; isDefault: boolean; onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.option,
        { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primaryLight : 'transparent', opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View style={styles.optionText}>
        <Text style={[styles.optionTitle, { color: colors.textPrimary }]}>
          {entry.name}{isDefault ? ' · Empfohlen' : ''}
        </Text>
        <Text style={[styles.hint, { color: colors.textSecondary }]}>{entry.subtitle}</Text>
      </View>
      {entry.connected && (
        <View style={[styles.pill, { backgroundColor: entry.canReceivePayments ? colors.successBackground : colors.warningBackground }]}>
          <Text style={[styles.pillText, { color: entry.canReceivePayments ? colors.success : colors.warning }]}>
            {entry.canReceivePayments ? 'Aktiv' : 'Verbunden'}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

/** Mollie panel: set up via browser (Mollie sign-up + OAuth), then the three states from the spec. */
function MollieSection({ entry, canManage, busy, onOnboard, onMoney }: {
  entry: PaymentProviderEntry; canManage: boolean; busy: boolean; onOnboard: () => void; onMoney: () => void;
}) {
  const { colors } = useTheme();
  const button = (label: string, onPress: () => void, loading = false) => (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary, opacity: pressed || loading ? 0.85 : 1 }]}
    >
      {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>{label}</Text>}
    </Pressable>
  );
  const dashboardUrl = entry.dashboardUrl;
  const headline = !entry.connected
    ? null
    : entry.canReceivePayments
      ? 'Zahlungen aktiv'
      : entry.onboardingStatus === 'in-review'
        ? 'Angaben werden geprüft'
        : 'Angaben fehlen';
  return (
    <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.sectionHeaderRow}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{entry.name}-Konto</Text>
        {entry.canReceivePayments && (
          <View style={[styles.pill, { backgroundColor: colors.successBackground }]}>
            <Text style={[styles.pillText, { color: colors.success }]}>Aktiv</Text>
          </View>
        )}
      </View>

      {entry.error && (
        <Text style={[styles.sectionBody, { color: colors.warning }]}>Status gerade nicht abrufbar: {entry.error}</Text>
      )}

      {!entry.connected && (
        <>
          <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
            Verkaufe Tickets für deine Veranstaltungen. Das Geld landet direkt auf dem Mollie-Konto
            deiner Organisation. Mollie ist ein Zahlungsanbieter aus den Niederlanden und prüft die
            Organisation (z. B. Registerauszug, Vertretungsberechtigte mit Ausweis, IBAN). Die Angaben
            gehen direkt an Mollie und werden nicht bei der Röbel App gespeichert.
          </Text>
          {canManage && button('Zahlungen einrichten', onOnboard, busy)}
        </>
      )}

      {entry.connected && headline && (
        <Text style={[styles.sectionBody, { color: colors.textPrimary }]}>{headline}</Text>
      )}

      {entry.connected && entry.canReceivePayments && (
        <>
          <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
            {entry.canReceiveSettlements ? 'Auszahlungen: aktiv' : 'Auszahlungen werden geprüft'}
          </Text>
          {canManage && button('Einnahmen & Auszahlungen', onMoney)}
        </>
      )}

      {entry.connected && !entry.canReceivePayments && canManage && (
        <>
          {dashboardUrl
            ? button('Angaben vervollständigen', () => { void WebBrowser.openBrowserAsync(dashboardUrl); })
            : button('Erneut verbinden', onOnboard, busy)}
        </>
      )}

      {entry.connected && (
        <Text style={[styles.hint, { color: colors.textTertiary }]}>
          Alles Weitere findest du jederzeit auch unter my.mollie.com
          {entry.livemode ? '' : ' (Testmodus)'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  optionText: { flex: 1, gap: 2 },
  optionTitle: { fontSize: 14, fontFamily: 'MonaSans-SemiBold' },
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
  refreshText: { fontSize: 12, fontFamily: 'MonaSans-Regular' },
  section: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 16, fontFamily: 'MonaSansSemiCondensed-SemiBold' },
  sectionBody: { fontSize: 13, fontFamily: 'MonaSans-Regular', lineHeight: 18 },
  hint: { fontSize: 12, fontFamily: 'MonaSans-Regular', lineHeight: 17 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pillText: { fontSize: 12, fontFamily: 'MonaSans-SemiBold' },
  dueList: { gap: 4 },
  dueItem: { fontSize: 13, fontFamily: 'MonaSans-Regular', lineHeight: 18 },
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
