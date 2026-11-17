/**
 * Confirm a register action prepared on a computer or in the app. Opened by the
 * `credential_action` push and by the org screens. The lines come from the phone's own reading
 * of the steps (reviewAction), never from the server's title; a mismatch shows the reason and no
 * "Bestätigen". One primary button, one "Verwerfen" text link.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import { useTheme } from '@/context/ThemeContext';
import { useGnosisWallet } from '@/context/GnosisWalletContext';
import { fontFamily } from '@/constants/theme';
import { CredentialScreenFrame, CredentialStatus, frameStyles } from '@/components/credentials/CredentialScreenFrame';
import { OrgChainNotice } from '@/components/credentials/OrgCredentialParts';
import { cancelAction, fetchAction, fetchActions, fetchOrgs, fetchTypes } from '@/lib/credreg/api';
import { parseSteps } from '@netizen-labs/credential-registry';
import { readBatchType, readTypeOrg } from '@/lib/credreg/chain';
import { nameAccounts } from '@/lib/credreg/delegates';
import { useCredentialsGate } from '@/lib/credreg/gate';
import {
  confirmAction,
  delegateAccounts,
  expectedDelegateFor,
  clearSentLock,
  hasSentLock,
  isPossiblySent,
  preparedLabel,
  reportSent,
  resolveActionOrg,
  reviewAction,
  submittedMessage,
  typeNamesFrom,
  type PhoneOrg,
} from '@/lib/credreg/org';
import type { ActionVia, PhoneAction, TypeView } from '@/lib/credreg/types';
import type { Hex } from 'viem';

type Loaded =
  | { key: string; status: 'error'; code: string; message: string }
  | {
      key: string;
      status: 'ready';
      action: PhoneAction;
      types: TypeView[];
      via: ActionVia | null;
      orgs: PhoneOrg[];
      /** The one org of the caller every step belongs to (from the phone's own list), or why not. */
      org: { ok: true; name: string } | { ok: false; reason: string };
      /** Lowercase account → display name, for setDelegate steps. */
      accountNames: Record<string, string>;
      loadedAt: number;
      /** A stored "possibly sent" lock (survives restarts). */
      sentLock: boolean;
    };

const CHAIN_UNAVAILABLE = 'Das Register ist gerade nicht erreichbar. Bitte versuche es gleich noch einmal.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function ApproveActionScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id?: string; org?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const gate = useCredentialsGate();
  const account = useActiveAccount();
  const { gnosisAccount } = useGnosisWallet();
  const [reloadKey, setReloadKey] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState<'confirm' | 'cancel' | 'report' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Hex | null>(null);
  const [done, setDone] = useState<'done' | 'submitted' | 'cancelled' | null>(null);
  const inFlight = useRef(false);
  // The operation may be on its way without a hash: no second send from this screen.
  const [locked, setLocked] = useState(false);
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
      // The phone's own org list: every step must belong to exactly one of these orgs.
      const orgsRes = await fetchOrgs(account);
      if (cancelled) return;
      if (!orgsRes.ok) {
        setLoaded({ key, status: 'error', code: orgsRes.code, message: submittedMessage(orgsRes) });
        return;
      }
      const orgs: PhoneOrg[] = orgsRes.data.map((o) => ({ accountId: o.accountId, name: o.name }));
      let steps: ReturnType<typeof parseSteps> = [];
      try {
        steps = parseSteps(res.data.steps);
      } catch {
        steps = []; // reviewAction names the problem
      }
      let org: { ok: true; name: string; accountId: string } | { ok: false; reason: string };
      try {
        const bound = steps.length ? await resolveActionOrg(steps, orgs, { typeOrg: readTypeOrg, batchType: readBatchType }) : null;
        org = !bound ? { ok: false, reason: '' } : bound.ok ? { ok: true, name: bound.org.name, accountId: bound.org.accountId } : bound;
      } catch {
        org = { ok: false, reason: CHAIN_UNAVAILABLE };
      }
      // Names and "prepared where" from that org's own lists; best effort.
      const [t, a, named] = await Promise.all([
        org.ok ? fetchTypes(account, org.accountId) : null,
        org.ok ? fetchActions(account, org.accountId) : null,
        nameAccounts(delegateAccounts(steps)),
      ]);
      if (cancelled) return;
      // Not awaiting any more: the server has settled it, so a stored lock is cleared.
      let sentLock = false;
      if (res.data.status === 'awaiting_confirmation') sentLock = await hasSentLock(res.data.id, Date.now());
      else await clearSentLock(res.data.id);
      if (cancelled) return;
      const accountNames: Record<string, string> = {};
      for (const n of named) if (n.displayName !== 'Konto ohne Namen') accountNames[n.address.toLowerCase()] = n.displayName;
      setLoaded({
        key,
        status: 'ready',
        action: res.data,
        types: t?.ok ? t.data : [],
        via: a?.ok ? (a.data.find((x) => x.id === id)?.via ?? null) : null,
        orgs,
        org: org.ok ? { ok: true, name: org.name } : org,
        accountNames,
        loadedAt: Date.now(),
        sentLock,
      });
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
  const accountNames = current.accountNames;
  const expectedDelegate = expectedDelegateFor(action.id);
  const reviewed = reviewAction(action, typeNamesFrom(current.types), current.loadedAt, {
    accounts: (address) => accountNames[address.toLowerCase()] ?? null,
    expectedDelegate,
    locked: current.sentLock || locked,
  });
  const orgProblem = !current.org.ok && current.org.reason ? current.org.reason : null;
  const review = { ...reviewed, problem: reviewed.problem ?? orgProblem };
  const orgName = current.org.ok ? current.org.name : null;

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
    // Synchronous guard: a double tap must never start two sends (state updates are async).
    if (inFlight.current || busy || !account) return;
    if (!gnosisAccount) {
      setError('Dein Konto ist gerade nicht verbunden. Bitte versuche es gleich noch einmal.');
      return;
    }
    inFlight.current = true;
    setBusy('confirm');
    setError(null);
    try {
      const r = await confirmAction(gnosisAccount, action, { apiAccount: account, orgs: current.orgs, expectedDelegate });
      if (r.ok) setDone(r.status);
      else {
        setError(r.message);
        if (r.sent) setSent(r.sent.txHash);
        if (r.locked) setLocked(true);
      }
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  const reportAgain = async () => {
    if (inFlight.current || busy || !account || !sent) return;
    inFlight.current = true;
    setBusy('report');
    setError(null);
    try {
      const r = await reportSent(account, action.id, sent);
      if (r.ok) setDone(r.status);
      else setError(r.message);
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  const discard = async () => {
    if (inFlight.current || busy || !account) return;
    inFlight.current = true;
    setBusy('cancel');
    setError(null);
    try {
      const r = await cancelAction(account, action.id);
      if (r.ok) setDone('cancelled');
      else setError(submittedMessage(r));
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  const prepared = preparedLabel(current.via);
  const canConfirm = review.problem === null && !sent && !locked;

  return (
    <CredentialScreenFrame title={title}>
      <ScrollView contentContainerStyle={styles.content}>
        {orgName ? <Text style={[styles.org, { color: colors.textPrimary }]}>{orgName}</Text> : null}
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
          {!sent && !locked && action.status === 'awaiting_confirmation' && !isPossiblySent(action.id) && !current.sentLock ? (
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
