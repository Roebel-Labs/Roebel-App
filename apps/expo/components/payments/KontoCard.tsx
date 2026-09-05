/**
 * "Konto & Karte" entry on the personal profile: the way any user opens a
 * Gnosis Pay Konto (euro balance + Visa debit card) through the same wizard a
 * merchant uses, minus the business link.
 *
 * Renders nothing while the pilot gate is closed for this wallet, so shipping
 * it to every profile is safe; the gate decides who sees it. Three states:
 * no Konto yet (call to action), in progress (resume), live (status).
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';

import { fontFamily } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { fetchMerchantAccount } from '@/lib/merchant/registry';
import type { MerchantAccountStatus } from '@/lib/merchant/types';
import { isStablecoinPaymentsEnabled } from '@/lib/supabase-app-settings';

type KontoState = 'hidden' | 'none' | 'pending' | 'live';

function stateFor(status: MerchantAccountStatus | null): KontoState {
  if (!status) return 'none';
  if (status === 'live') return 'live';
  if (status === 'suspended') return 'hidden';
  return 'pending';
}

export default function KontoCard() {
  const { colors } = useTheme();
  const router = useRouter();
  const account = useActiveAccount();
  const [state, setState] = useState<KontoState>('hidden');

  useEffect(() => {
    if (!account?.address) {
      setState('hidden');
      return;
    }
    let cancelled = false;
    (async () => {
      const enabled = await isStablecoinPaymentsEnabled({ walletAddress: account.address });
      if (cancelled) return;
      if (!enabled) {
        setState('hidden');
        return;
      }
      const konto = await fetchMerchantAccount(account.address);
      if (!cancelled) setState(stateFor(konto?.status ?? null));
    })();
    return () => {
      cancelled = true;
    };
  }, [account?.address]);

  if (state === 'hidden') return null;

  const copy = {
    none: {
      title: 'Konto & Karte eröffnen',
      body: 'Euro-Konto mit Visa-Debitkarte. In zehn Minuten, mit Ausweis.',
      action: 'Jetzt eröffnen',
    },
    pending: {
      title: 'Konto wird eröffnet',
      body: 'Sie haben angefangen. Machen Sie dort weiter, wo Sie aufgehört haben.',
      action: 'Weiter',
    },
    live: {
      title: 'Konto aktiv',
      body: 'Visa-Debitkarte · Guthaben in Euro. Kartendaten und IBAN folgen hier.',
      action: 'Öffnen',
    },
  }[state];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={copy.title}
      onPress={() => router.push('/payments/onboarding' as any)}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.borderSecondary },
        pressed && { opacity: 0.85 },
      ]}
    >
      <View style={styles.textBlock}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{copy.title}</Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>{copy.body}</Text>
      </View>
      <View style={[styles.pill, { backgroundColor: colors.primary }]}>
        <Text style={[styles.pillText, { color: colors.onPrimary }]}>{copy.action}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  textBlock: { flex: 1, gap: 4 },
  title: { fontFamily: fontFamily.semiBold, fontSize: 16 },
  body: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 18 },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  pillText: { fontFamily: fontFamily.semiBold, fontSize: 13 },
});
