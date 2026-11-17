/**
 * Confirm a register action prepared on a computer or in the app. Opened by the
 * `credential_action` push and by the org screens. The lines come from the phone's own reading
 * of the steps (reviewAction), never from the server's title; a mismatch shows the reason and no
 * "Bestätigen". One primary button, one "Verwerfen" text link.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import { useTheme } from '@/context/ThemeContext';
import { useGnosisWallet } from '@/context/GnosisWalletContext';
import { fontFamily } from '@/constants/theme';
import { CredentialScreenFrame, CredentialStatus, frameStyles } from '@/components/credentials/CredentialScreenFrame';
import { OrgChainNotice } from '@/components/credentials/OrgCredentialParts';
import { cancelAction, fetchAction, fetchActions, fetchOrgs, fetchTypes } from '@/lib/credreg/api';
import { useCredentialsGate } from '@/lib/credreg/gate';
import { confirmAction, preparedLabel, reportSent, reviewAction, submittedMessage, typeNamesFrom } from '@/lib/credreg/org';
import type { ActionVia, PhoneAction, TypeView } from '@/lib/credreg/types';
import type { Hex } from 'viem';

type Loaded =
  | { key: string; status: 'error'; code: string; message: string }
  | { key: string; status: 'ready'; action: PhoneAction; types: TypeView[]; via: ActionVia | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function ApproveActionScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id?: string; org?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const orgHint = typeof params.org === 'string' && UUID.test(params.org) ? params.org : null;
  const gate = useCredentialsGate();
  const account = useActiveAccount();
  const { gnosisAccount } = useGnosisWallet();
  const [reloadKey, setReloadKey] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState<'confirm' | 'cancel' | 'report' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Hex | null>(null);
  const [done, setDone] = useState<'done' | 'submitted' | 'cancelled' | null>(null);
  const key = `${id}:${account?.address ?? ''}:${reloadKey}`;

  useEffect(() => {
    if (gate !== true || !account || !UUID.test(id)) return;
    let cancelled = false;
    (async () => {
      const res = await fetchAction(account, id);
      if (cancelled) return;
      if (!res.ok) {
        setLoaded({ key, status: 'error', code: res.code, message: submittedMessage(res) });
        return;
      }
      // Names and "prepared where" from the org's own lists; best effort.
      let orgIds: string[] = orgHint ? [orgHint] : [];
      if (!orgHint) {
        const orgs = await fetchOrgs(account);
        orgIds = orgs.ok ? orgs.data.map((o) => o.accountId) : [];
      }
      const lists = await Promise.all(orgIds.map((o) => Promise.all([fetchTypes(account, o), fetchActions(account, o)])));
      if (cancelled) return;
      const types: TypeView[] = [];
      let via: ActionVia | null = null;
      for (const [t, a] of lists) {
        if (t.ok) types.push(...t.data);
        if (a.ok) via = a.data.find((x) => x.id === id)?.via ?? via;
      }
      setLoaded({ key, status: 'ready', action: res.data, types, via });
    })();
    return () => {
      cancelled = true;
    };
    // the account object changes identity on re-render; the key carries what matters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate, key]);

  const title = 'Bestätigen';
  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/profile' as any);
  };

  if (!UUID.test(id)) {
    return (
      <CredentialScreenFrame title={title}>
        <CredentialStatus title="Nicht gefunden" message="Diese Aktion gibt es nicht." />
      </CredentialScreenFrame>
    );
  }
  if (gate === false) {
    return (
      <CredentialScreenFrame title={title}>
        <CredentialStatus title="Noch nicht verfügbar" message="Ausweise gibt es in deiner App bald." />
      </CredentialScreenFrame>
    );
  }
  if (gate === true && !account) {
    return (
      <CredentialScreenFrame title={title}>
        <CredentialStatus title="Bitte melde dich an" message="Melde dich an, um diese Aktion zu bestätigen." />
      </CredentialScreenFrame>
    );
  }
  const current = loaded && loaded.key === key ? loaded : null;
  if (!current) {
    return (
      <CredentialScreenFrame title={title}>
        <CredentialStatus loading />
      </CredentialScreenFrame>
    );
  }
  if (current.status === 'error') {
    if (current.code === 'ORG_NOT_ON_CHAIN' || current.code === 'NO_CHAIN_AUTHORITY') {
      return (
        <CredentialScreenFrame title={title}>
          <OrgChainNotice reason={current.code === 'NO_CHAIN_AUTHORITY' ? 'no_chain_authority' : 'org_not_registered'} />
        </CredentialScreenFrame>
      );
    }
    if (current.code === 'NOT_FOUND') {
      return (
        <CredentialScreenFrame title={title}>
          <CredentialStatus title="Nicht gefunden" message="Diese Aktion gibt es nicht." actionLabel="Zurück" onAction={back} />
        </CredentialScreenFrame>
      );
    }
    return (
      <CredentialScreenFrame title={title}>
        <CredentialStatus title="Das hat nicht geklappt" message={current.message} actionLabel="Erneut versuchen" onAction={() => setReloadKey((k) => k + 1)} />
      </CredentialScreenFrame>
    );
  }

  const action = current.action;
  const review = reviewAction(action, typeNamesFrom(current.types));

  if (done) {
    const message =
      done === 'cancelled'
        ? 'Die Aktion wurde verworfen. Es wurde nichts gesendet.'
        : done === 'done'
          ? review.hasBatch
            ? 'Erledigt. Die Einladungen werden jetzt verschickt.'
            : 'Erledigt. Die Änderung steht jetzt im Register.'
          : 'Gesendet. Sobald das Register die Transaktion bestätigt, ist alles erledigt.';
    return (
      <CredentialScreenFrame title={title}>
        <CredentialStatus title={done === 'cancelled' ? 'Verworfen' : 'Erledigt'} message={message} actionLabel="Fertig" onAction={back} />
      </CredentialScreenFrame>
    );
  }

  const confirm = async () => {
    if (busy || !account) return;
    if (!gnosisAccount) {
      setError('Dein Konto ist gerade nicht verbunden. Bitte versuche es gleich noch einmal.');
      return;
    }
    setBusy('confirm');
    setError(null);
    try {
      const r = await confirmAction(gnosisAccount, action, { apiAccount: account });
      if (r.ok) setDone(r.status);
      else {
        setError(r.message);
        if (r.sent) setSent(r.sent.txHash);
      }
    } finally {
      setBusy(null);
    }
  };

  const reportAgain = async () => {
    if (busy || !account || !sent) return;
    setBusy('report');
    setError(null);
    try {
      const r = await reportSent(account, action.id, sent);
      if (r.ok) setDone(r.status);
      else setError(r.message);
    } finally {
      setBusy(null);
    }
  };

  const discard = async () => {
    if (busy || !account) return;
    setBusy('cancel');
    setError(null);
    try {
      const r = await cancelAction(account, action.id);
      if (r.ok) setDone('cancelled');
      else setError(submittedMessage(r));
    } finally {
      setBusy(null);
    }
  };

  const prepared = preparedLabel(current.via);
  const canConfirm = review.problem === null && !sent;

  return (
    <CredentialScreenFrame title={title}>
      <ScrollView contentContainerStyle={styles.content}>
        {action.summary?.orgName ? <Text style={[styles.org, { color: colors.textPrimary }]}>{action.summary.orgName}</Text> : null}
        {prepared ? <Text style={[styles.meta, { color: colors.textSecondary }]}>{prepared}</Text> : null}

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSecondary }]}>
          {review.lines.map((line, i) => (
            <Text key={i} style={[styles.line, { color: colors.textPrimary }]}>
              {line}
            </Text>
          ))}
          {review.counts ? (
            <Text style={[styles.meta, { color: colors.textSecondary }]}>
              {review.counts.app} in der App, {review.counts.link} per Link
            </Text>
          ) : null}
        </View>

        {review.problem ? <Text style={[styles.problem, { color: colors.error }]}>{review.problem}</Text> : null}
        {busy === 'confirm' ? <Text style={[styles.meta, { color: colors.textSecondary }]}>Wird ins Register von Röbel eingetragen …</Text> : null}
        {error ? <Text style={[styles.problem, { color: colors.error }]}>{error}</Text> : null}

        <View style={styles.actions}>
          {sent ? (
            <Pressable
              onPress={reportAgain}
              disabled={busy !== null}
              style={[frameStyles.primary, { backgroundColor: colors.primary }, busy !== null && frameStyles.busy]}
              accessibilityRole="button"
              accessibilityLabel="Erneut melden"
            >
              {busy === 'report' ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={[frameStyles.primaryText, { color: colors.onPrimary }]}>Erneut melden</Text>}
            </Pressable>
          ) : canConfirm ? (
            <Pressable
              onPress={confirm}
              disabled={busy !== null}
              style={[frameStyles.primary, { backgroundColor: colors.primary }, busy !== null && frameStyles.busy]}
              accessibilityRole="button"
              accessibilityLabel="Bestätigen"
              accessibilityState={{ disabled: busy !== null, busy: busy === 'confirm' }}
            >
              {busy === 'confirm' ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={[frameStyles.primaryText, { color: colors.onPrimary }]}>Bestätigen</Text>}
            </Pressable>
          ) : null}
          {!sent && action.status === 'awaiting_confirmation' ? (
            <Pressable onPress={discard} disabled={busy !== null} style={styles.discard} accessibilityRole="button" accessibilityLabel="Verwerfen">
              {busy === 'cancel' ? (
                <ActivityIndicator color={colors.textSecondary} />
              ) : (
                <Text style={[styles.discardText, { color: colors.textSecondary }, busy !== null && frameStyles.busy]}>Verwerfen</Text>
              )}
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </CredentialScreenFrame>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  org: { fontSize: 20, fontFamily: fontFamily.semiBold },
  meta: { fontSize: 13, fontFamily: fontFamily.regular, lineHeight: 18 },
  card: { padding: 16, borderRadius: 12, borderWidth: 1, gap: 8 },
  line: { fontSize: 16, fontFamily: fontFamily.medium, lineHeight: 22 },
  problem: { fontSize: 14, fontFamily: fontFamily.regular, lineHeight: 20 },
  actions: { marginTop: 8, gap: 4 },
  discard: { alignItems: 'center', paddingVertical: 14 },
  discardText: { fontSize: 15, fontFamily: fontFamily.medium },
});
