/**
 * Guardian side of a recovery. Deep link:
 *   roebel://passkey/recover?wallet=<Safe>&signer=<new owner>&name=<display>[&legacy=<address>]
 * The guardian checks in person / by phone, then confirms ON-CHAIN with one fingerprint:
 * SRM.confirmRecovery(wallet, [signer], 1, false) from their own passkey Safe (sponsored; a
 * counterfactual Safe deploys in that op), or via their legacy account when that is the guardian.
 * The person's name comes from the chain + profiles; the link's `name` is only a fallback label.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { isAddressEqual, type Address } from 'viem';
import { useTheme } from '@/context/ThemeContext';
import { BigButton, Card, Initials, Notice, ScreenHeader, friendlyError, passkeyStyles, usePasskeyGate } from '@/components/passkey/PasskeyUi';
import { parseRecoverParams } from '@/lib/passkey/deeplinks';
import { planGuardianConfirm, type GuardianConfirmPlan } from '@/lib/passkey/guardian-plan';
import { readGuardians, readRecoveryApprovals, readThreshold, type RecoveryRequest } from '@/lib/passkey/guardians';
import { loadMigrationRecord, type MigrationRecord } from '@/lib/passkey/migration';
import { secureKeyValueStorage } from '@/lib/passkey/migration-runtime';
import type { Person } from '@/lib/passkey/people';
import { readRecoveryRequestSafe, resolvePeopleNow, sendGuardianConfirm } from '@/lib/passkey/guardians-runtime';

type Chain = {
  plan: GuardianConfirmPlan;
  approvals: number;
  threshold: number;
  request: RecoveryRequest | null;
};

export default function ConfirmRecoveryScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams();
  const allowed = usePasskeyGate();
  // useLocalSearchParams may hand out a new object per render: key the parse on its content.
  const paramsKey = JSON.stringify(params);
  const link = useMemo(() => parseRecoverParams(JSON.parse(paramsKey) as Record<string, string>), [paramsKey]);
  const [record, setRecord] = useState<MigrationRecord | null | undefined>(undefined);
  const [person, setPerson] = useState<Person | null>(null);
  const [chain, setChain] = useState<Chain | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!link) return;
    setLoadError(null);
    const rec = await loadMigrationRecord(secureKeyValueStorage).catch(() => null);
    setRecord(rec);
    resolvePeopleNow([link.wallet])
      .then((m) => setPerson(m.get(link.wallet.toLowerCase()) ?? null))
      .catch(() => setPerson(null));
    if (!rec) return;
    try {
      const [guardians, threshold, approvals, request] = await Promise.all([
        readGuardians(link.wallet),
        readThreshold(link.wallet),
        readRecoveryApprovals(link.wallet, [link.signer], 1),
        readRecoveryRequestSafe(link.wallet),
      ]);
      const plan = planGuardianConfirm({
        wallet: link.wallet,
        signer: link.signer,
        guardians,
        mySafe: rec.safe,
        myLegacy: rec.legacy ?? null,
        recoveryLegacy: link.legacy,
      });
      setChain({ plan, approvals: Number(approvals), threshold: Number(threshold), request });
    } catch (e) {
      setLoadError(friendlyError(e, 'Die Angaben konnten nicht geladen werden.'));
    }
  }, [link]);

  useEffect(() => {
    if (allowed) load().catch(() => undefined);
    else if (allowed === false) setRecord(null);
  }, [allowed, load]);

  const onConfirm = useCallback(async () => {
    const plan = chain?.plan;
    if (!record || !plan || (plan.kind !== 'safe' && plan.kind !== 'legacy')) return;
    setBusy(true);
    setNotice(null);
    try {
      await sendGuardianConfirm(record, plan);
      setConfirmed(true);
      await load();
    } catch (e) {
      const msg = friendlyError(e);
      if (msg) setNotice(msg);
    } finally {
      setBusy(false);
    }
  }, [chain, record, load]);

  if (!allowed || record === undefined) {
    return (
      <SafeAreaView style={[passkeyStyles.container, { backgroundColor: colors.background }]}>
        <View style={passkeyStyles.center}>{allowed === false ? null : <ActivityIndicator color={colors.primary} />}</View>
      </SafeAreaView>
    );
  }

  const name = person?.known ? person.name : (link?.name ?? 'Diese Person');
  const req = chain?.request;
  const otherPending = !!req && req.executeAfter > 0n && !req.newOwners.some((o: Address) => !!link && isAddressEqual(o, link.signer));
  const alreadyStarted = !!req && req.executeAfter > 0n && !otherPending;

  return (
    <SafeAreaView style={[passkeyStyles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title="Wiederherstellung bestätigen" />
      <ScrollView contentContainerStyle={passkeyStyles.content}>
        {!link ? (
          <Notice tone="error" text="Dieser Link ist ungültig. Bitte lass dir den Code noch einmal zeigen." />
        ) : !record ? (
          <>
            <Notice tone="warning" text="Auf diesem Handy ist noch kein Passkey eingerichtet. Nur Vertrauenspersonen mit Passkey können bestätigen." />
            <BigButton label="Zu Passkey & Wiederherstellung" onPress={() => router.replace('/settings/passkey' as any)} />
          </>
        ) : (
          <>
            <Card style={{ alignItems: 'center' }}>
              <Initials name={name} size={72} />
              <Text style={[passkeyStyles.lede, { color: colors.textPrimary, textAlign: 'center' }]}>
                {name} möchte das Konto wiederherstellen.
              </Text>
              <Text style={[passkeyStyles.body, { color: colors.textPrimary, textAlign: 'center' }]}>
                Bist du sicher, dass es wirklich {name} ist?
              </Text>
              {!person?.known ? (
                <Text style={[passkeyStyles.bodySmall, { color: colors.textSecondary, textAlign: 'center' }]}>
                  Wir konnten den Namen nicht prüfen. Er stammt aus dem Link.
                </Text>
              ) : null}
            </Card>

            <Notice
              tone="info"
              text="Frag am besten persönlich nach oder ruf kurz an. Bestätige nie nur, weil dir jemand einen Link geschickt hat."
            />

            {loadError ? <Notice tone="error" text={loadError} /> : null}
            {!chain && !loadError ? <ActivityIndicator color={colors.primary} /> : null}

            {chain ? (
              chain.plan.kind === 'self' ? (
                <Notice tone="info" text="Das ist dein eigenes Konto. Bitte deine Vertrauenspersonen, diesen Code zu öffnen." />
              ) : chain.plan.kind === 'notGuardian' ? (
                <Notice tone="warning" text={`Du bist keine Vertrauensperson von ${name}. Du kannst hier nichts bestätigen.`} />
              ) : otherPending ? (
                <Notice tone="warning" text="Für dieses Konto läuft gerade eine andere Wiederherstellung. Bitte nichts bestätigen und mit der Person sprechen." />
              ) : (
                <>
                  <Text style={[passkeyStyles.body, { color: colors.textSecondary }]}>
                    {chain.approvals} von {chain.threshold} Vertrauenspersonen haben bestätigt.
                  </Text>
                  {confirmed || alreadyStarted ? (
                    <>
                      <Notice
                        tone="success"
                        text={
                          alreadyStarted
                            ? 'Genug Vertrauenspersonen haben bestätigt. Das Konto ist in 3 Tagen wieder da.'
                            : 'Danke! Du hast bestätigt.'
                        }
                      />
                      <BigButton label="Fertig" onPress={() => router.replace('/' as any)} />
                    </>
                  ) : (
                    <BigButton label={`Ja, es ist ${name}`} onPress={onConfirm} busy={busy} />
                  )}
                </>
              )
            ) : null}
            {notice ? <Notice tone="error" text={notice} /> : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
