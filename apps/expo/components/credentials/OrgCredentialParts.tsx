/**
 * Shared pieces of the org credential screens (index, issue, approve, delegates): the active org
 * with its register state, and the one explanation card shown when the org is not on chain.
 * Self-contained so plan 3b can move the screens into the org profile without a rewrite.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import { useGnosisWallet } from '@/context/GnosisWalletContext';
import { fontFamily } from '@/constants/theme';
import { fetchOrgs } from '@/lib/credreg/api';
import { useCredentialsGate } from '@/lib/credreg/gate';
import { ROLE_SYNC_MESSAGE } from '@/lib/credreg/org';
import type { OrgListEntry } from '@/lib/credreg/types';

export type CredOrgState =
  | { status: 'loading' }
  | { status: 'closed' }
  | { status: 'signed_out' }
  | { status: 'not_admin' }
  | { status: 'error' }
  | { status: 'ready'; org: OrgListEntry };

/**
 * The active org account as the register sees it (orgs_list). Owner or admin only. No call to the
 * credential routes while the gate is closed or loading.
 */
export function useCredOrg() {
  const gate = useCredentialsGate();
  const account = useActiveAccount();
  const { gnosisAccount } = useGnosisWallet();
  const { activeAccount, roleInActiveAccount } = useAccount();
  const address = account?.address?.toLowerCase() ?? null;
  const accountId = activeAccount?.account_type === 'organisation' ? activeAccount.id : null;
  const allowedRole = roleInActiveAccount === 'owner' || roleInActiveAccount === 'admin';
  const [reloadKey, setReloadKey] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; entry: OrgListEntry | null; failed: boolean } | null>(null);
  const key = `${address}:${accountId}:${reloadKey}`;

  useEffect(() => {
    if (gate !== true || !account || !accountId || !allowedRole) return;
    let cancelled = false;
    fetchOrgs(account).then((res) => {
      if (cancelled) return;
      if (!res.ok) setLoaded({ key, entry: null, failed: true });
      else setLoaded({ key, entry: res.data.find((o) => o.accountId === accountId) ?? null, failed: false });
    });
    return () => {
      cancelled = true;
    };
    // the account object changes identity on re-render; the key carries what matters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate, key, allowedRole]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  let state: CredOrgState;
  if (gate === null) state = { status: 'loading' };
  else if (gate === false) state = { status: 'closed' };
  else if (!account) state = { status: 'signed_out' };
  else if (!accountId || (roleInActiveAccount !== null && !allowedRole)) state = { status: 'not_admin' };
  else if (!loaded || loaded.key !== key) state = { status: 'loading' };
  else if (loaded.failed) state = { status: 'error' };
  else if (!loaded.entry) state = { status: 'not_admin' };
  else state = { status: 'ready', org: loaded.entry };

  return { state, account: account ?? null, gnosisAccount, reload };
}

/** The org is not registered on chain, or the caller's role is not synced there. One card, one button. */
export function OrgChainNotice({ reason }: { reason: 'org_not_registered' | 'no_chain_authority' }) {
  const router = useRouter();
  const { colors } = useTheme();
  const text =
    reason === 'org_not_registered'
      ? 'Diese Organisation ist noch nicht im öffentlichen Register eingetragen. Trage sie zuerst ein: Organisation → Einstellungen → Onchain-Organisation. Danach kannst du hier Ausweise ausstellen.'
      : ROLE_SYNC_MESSAGE;
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSecondary }]}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>
        {reason === 'org_not_registered' ? 'Noch nicht im Register' : 'Rollen abgleichen'}
      </Text>
      <Text style={[styles.text, { color: colors.textSecondary }]}>{text}</Text>
      <Pressable
        onPress={() => router.push('/org/settings' as any)}
        style={[styles.button, { backgroundColor: colors.primary }]}
        accessibilityRole="button"
        accessibilityLabel="Zu den Einstellungen"
      >
        <Text style={[styles.buttonText, { color: colors.onPrimary }]}>Zu den Einstellungen</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { margin: 16, padding: 16, borderRadius: 12, borderWidth: 1, gap: 10 },
  title: { fontSize: 17, fontFamily: fontFamily.semiBold },
  text: { fontSize: 15, fontFamily: fontFamily.regular, lineHeight: 21 },
  button: { marginTop: 4, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  buttonText: { fontSize: 16, fontFamily: fontFamily.semiBold },
});
