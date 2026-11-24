/**
 * Notifications screen entry for an attester task (today: an org registration request). Shows the
 * live state from the chain and lets the attester confirm or reject right here; "Details" opens
 * the attester inbox with the full request.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useGnosisWallet } from '@/context/GnosisWalletContext';
import { fontFamily } from '@/constants/theme';
import { readOrgRequestState, type OrgRequestState } from '@/lib/org-safe/chain';
import { orgVoteErrorText, voteOnOrgRequest } from '@/lib/org-safe/vote';
import type { UserNotification } from '@/lib/types';

type Props = { notification: UserNotification; onRead: (n: UserNotification) => void };

function stateLine(s: OrgRequestState, now: number): string | null {
  if (s.status === 1) return 'Bestätigt. Die Organisation ist jetzt eingetragen.';
  if (s.status === 2) return 'Abgelehnt.';
  if (s.status !== 0 || s.expiresAt <= now) return 'Die Anfrage ist nicht mehr offen.';
  if (s.voted) return `Du hast abgestimmt · ${s.approvals} von ${s.required} Bestätigungen`;
  return null;
}

export default function AttesterTaskNotificationCard({ notification, onRead }: Props) {
  const router = useRouter();
  const { colors } = useTheme();
  const { gnosisAccount } = useGnosisWallet();
  const meta = (notification.metadata ?? {}) as { requestId?: string; orgName?: string | null };
  const requestId = meta.requestId !== undefined ? Number(meta.requestId) : NaN;
  const [state, setState] = useState<(OrgRequestState & { readAt: number }) | null>(null);
  const [busy, setBusy] = useState<'a' | 'r' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!gnosisAccount || !Number.isInteger(requestId)) return;
    try {
      const s = await readOrgRequestState(requestId, gnosisAccount.address);
      setState({ ...s, readAt: Math.floor(Date.now() / 1000) });
    } catch {
      // chain read failed: the buttons stay hidden, "Details" still works
    }
  }, [gnosisAccount, requestId]);

  useEffect(() => {
    let alive = true;
    if (gnosisAccount && Number.isInteger(requestId)) {
      readOrgRequestState(requestId, gnosisAccount.address)
        .then((s) => {
          if (alive) setState({ ...s, readAt: Math.floor(Date.now() / 1000) });
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [gnosisAccount, requestId]);

  const vote = async (approve: boolean) => {
    if (!gnosisAccount || busy) return;
    setBusy(approve ? 'a' : 'r');
    setError(null);
    try {
      await voteOnOrgRequest(gnosisAccount, requestId, approve);
      onRead(notification);
      await load();
    } catch (e) {
      setError(orgVoteErrorText(e));
    } finally {
      setBusy(null);
    }
  };

  const openInbox = () => {
    onRead(notification);
    router.push('/verification/orgs' as any);
  };

  const line = state ? stateLine(state, state.readAt) : null;
  const canVote = !!state && line === null;

  return (
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.background }]}>
      <View style={styles.headerRow}>
        {!notification.is_read && <View style={[styles.unread, { backgroundColor: colors.primary }]} />}
        <Text style={[styles.title, { color: colors.textPrimary }]}>{notification.title}</Text>
      </View>
      <Text style={[styles.body, { color: colors.textSecondary }]}>{notification.body}</Text>
      {state && canVote && (
        <Text style={[styles.meta, { color: colors.textSecondary }]}>
          {state.approvals} von {state.required} Bestätigungen
        </Text>
      )}
      {line && <Text style={[styles.meta, { color: colors.textSecondary }]}>{line}</Text>}
      {error && <Text style={[styles.meta, { color: colors.error }]}>{error}</Text>}
      <View style={styles.actions}>
        {canVote && (
          <>
            <Pressable
              onPress={() => vote(true)}
              disabled={!!busy}
              accessibilityRole="button"
              accessibilityLabel={`${meta.orgName ?? 'Organisation'} bestätigen`}
              style={[styles.button, { backgroundColor: colors.primary }, busy && styles.dim]}
            >
              {busy === 'a' ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={[styles.buttonText, { color: colors.onPrimary }]}>Bestätigen</Text>}
            </Pressable>
            <Pressable
              onPress={() => vote(false)}
              disabled={!!busy}
              accessibilityRole="button"
              accessibilityLabel={`${meta.orgName ?? 'Organisation'} ablehnen`}
              style={[styles.button, styles.outline, { borderColor: colors.border }, busy && styles.dim]}
            >
              {busy === 'r' ? <ActivityIndicator color={colors.textPrimary} /> : <Text style={[styles.buttonText, { color: colors.textPrimary }]}>Ablehnen</Text>}
            </Pressable>
          </>
        )}
        <Pressable onPress={openInbox} accessibilityRole="button" accessibilityLabel="Details ansehen" style={styles.link}>
          <Text style={[styles.linkText, { color: colors.primary }]}>Details</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginVertical: 6, borderWidth: 1, borderRadius: 16, padding: 14, gap: 6 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  unread: { width: 8, height: 8, borderRadius: 4 },
  title: { fontFamily: fontFamily.semiBold, fontSize: 15, flex: 1 },
  body: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20 },
  meta: { fontFamily: fontFamily.medium, fontSize: 13 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  button: { borderRadius: 999, paddingHorizontal: 16, minHeight: 38, justifyContent: 'center', alignItems: 'center' },
  outline: { borderWidth: 1 },
  buttonText: { fontFamily: fontFamily.semiBold, fontSize: 14 },
  dim: { opacity: 0.6 },
  link: { marginLeft: 'auto', paddingHorizontal: 6, minHeight: 38, justifyContent: 'center' },
  linkText: { fontFamily: fontFamily.semiBold, fontSize: 14 },
});
