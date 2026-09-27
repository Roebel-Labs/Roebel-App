// Org money dashboard: Stripe's in-app Payments, Payouts and notification-banner components for
// the active org's connected account. Owner/admin only (the session route enforces it too).
// Refunds are not offered here; they run through the ticket order list, which also returns the
// platform fee and voids the tickets. Older binaries without the native SDK get a short note.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import * as WebBrowser from 'expo-web-browser';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import { useConnectInstance } from '@/components/payments/useConnectInstance';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

type Tab = 'payments' | 'payouts';

export default function OrgMoneyScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { activeAccount, roleInActiveAccount } = useAccount();
  const thirdwebAccount = useActiveAccount();
  const [tab, setTab] = useState<Tab>('payments');
  const [failed, setFailed] = useState<string | null>(null);
  const [bannerHeight, setBannerHeight] = useState(0);

  const isOrg = activeAccount?.account_type === 'organisation';
  const canManage = roleInActiveAccount === 'owner' || roleInActiveAccount === 'admin';

  useEffect(() => {
    if (!activeAccount || !isOrg) router.replace('/profile');
  }, [activeAccount, isOrg, router]);

  const onError = useCallback((message: string) => setFailed(message), []);
  const { stripe, instance } = useConnectInstance({
    enabled: isOrg && canManage && !failed,
    accountId: activeAccount?.id,
    signer: thirdwebAccount,
    onError,
  });

  if (!activeAccount || !isOrg) return null;

  const header = (
    <View style={[styles.header, { borderBottomColor: colors.border }]}>
      <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={8}>
        <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
      </Pressable>
      <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Einnahmen</Text>
      <View style={styles.headerSpacer} />
    </View>
  );

  const note = (text: string, withDashboardLink: boolean) => (
    <View style={[styles.note, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.noteText, { color: colors.textSecondary }]}>{text}</Text>
      {withDashboardLink && (
        <Pressable
          onPress={() => void WebBrowser.openBrowserAsync('https://dashboard.stripe.com')}
          style={({ pressed }) => [styles.linkButton, { borderColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
        >
          <Text style={[styles.linkText, { color: colors.primary }]}>Stripe-Dashboard öffnen</Text>
        </Pressable>
      )}
    </View>
  );

  let body: React.ReactNode;
  if (!canManage) {
    body = note('Einnahmen sehen nur Inhaber und Admins der Organisation.', false);
  } else if (!stripe) {
    body = note('In dieser App-Version ist die Übersicht noch nicht verfügbar. Bitte aktualisiere die App.', true);
  } else if (failed) {
    body = note(failed, true);
  } else if (!instance) {
    body = (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  } else {
    const { ConnectComponentsProvider, ConnectNotificationBanner, ConnectPayments, ConnectPayouts } = stripe;
    const loadError = () => Alert.alert('Fehler', 'Die Übersicht konnte nicht geladen werden. Bitte versuche es erneut.');
    body = (
      <ConnectComponentsProvider connectInstance={instance}>
        <View style={{ height: bannerHeight }}>
          <ConnectNotificationBanner
            style={{ flex: 1 }}
            onContentHeightChange={setBannerHeight}
            collectionOptions={{ fields: 'eventually_due', futureRequirements: 'include' }}
          />
        </View>
        <View style={[styles.tabs, { borderColor: colors.border }]}>
          {(['payments', 'payouts'] as const).map((t) => {
            const active = tab === t;
            return (
              <Pressable
                key={t}
                onPress={() => setTab(t)}
                style={[styles.tab, active && { backgroundColor: colors.surface }]}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.tabText, { color: active ? colors.textPrimary : colors.textSecondary }]}>
                  {t === 'payments' ? 'Zahlungen' : 'Auszahlungen'}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.component}>
          {tab === 'payments' ? (
            <ConnectPayments style={{ flex: 1 }} onLoadError={loadError} />
          ) : (
            <ConnectPayouts style={{ flex: 1 }} onLoadError={loadError} />
          )}
        </View>
      </ConnectComponentsProvider>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {header}
      {body}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  note: { margin: 16, borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 },
  noteText: { fontSize: 14, fontFamily: 'Inter-Regular', lineHeight: 20 },
  linkButton: { height: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  linkText: { fontSize: 14, fontFamily: 'MonaSansSemiCondensed-Bold' },
  tabs: { flexDirection: 'row', marginHorizontal: 16, marginTop: 12, borderWidth: 1, borderRadius: 12, padding: 4, gap: 4 },
  tab: { flex: 1, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 14, fontFamily: 'Inter-SemiBold' },
  component: { flex: 1, marginTop: 8 },
});
