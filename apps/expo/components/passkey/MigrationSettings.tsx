import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useActiveAccount, useActiveWallet } from 'thirdweb/react';
import type { Address, Hex } from 'viem';

import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { useMaci } from '@/context/MaciContext';
import { fontFamily } from '@/constants/theme';
import MigrationSteps, { stepStates } from '@/components/passkey/MigrationSteps';
import EmailRow from '@/components/passkey/EmailRow';
import PasskeySessionSwitch from '@/components/passkey/PasskeySessionSwitch';
import KeysAndMessagesSection from '@/components/passkey/KeysAndMessagesSection';
import PasskeyRecoverySection from '@/components/passkey/PasskeyRecoverySection';
import { RecoveryBanner } from '@/components/passkey/RecoveryBanner';
import {
  loadMigrationRecord,
  runPasskeyMigration,
  type MigrationRecord,
  type MigrationStep,
  type RewrapStatus,
} from '@/lib/passkey/migration';
import { createMigrationDeps, secureKeyValueStorage } from '@/lib/passkey/migration-runtime';

type Notice = { tone: 'info' | 'error' | 'success'; text: string } | null;

type Props = {
  /** The record the chooser already loaded (avoids a second read). */
  initialRecord: MigrationRecord | null;
  /** The migration surface is open: "Passkey einrichten" may start. */
  canStart: boolean;
  /** The detach surface is open: the detach row is shown. */
  canDetach: boolean;
};

export default function MigrationSettings({ initialRecord, canStart, canDetach }: Props) {
  const router = useRouter();
  const { colors } = useTheme();
  const { user } = useUser();
  const { serializedKeypair } = useMaci();
  const account = useActiveAccount();
  const wallet = useActiveWallet();

  const [record, setRecord] = useState<MigrationRecord | null>(initialRecord);
  const [step, setStep] = useState<MigrationStep>('idle');
  const [failedAt, setFailedAt] = useState<MigrationStep | null>(null);
  const [rewrap, setRewrap] = useState<RewrapStatus | undefined>(initialRecord?.rewrap);
  const [notice, setNotice] = useState<Notice>(null);
  const [running, setRunning] = useState(false);
  const lastStep = useRef<MigrationStep>('idle');

  const connected = record?.status === 'done' && step !== 'error';
  const hasPasskey = !!record;

  const onStart = useCallback(async () => {
    if (running) return;
    const legacy = account?.address as Address | undefined;
    // The EIP-712 handover must be signed by the thirdweb ADMIN EOA: a smart-account signature
    // would be ERC-1271-wrapped and fail verifySignerPermissionRequest.
    const admin = wallet && wallet.id === 'inApp' ? wallet.getAdminAccount?.() : undefined;
    if (!legacy || !admin) {
      setNotice({
        tone: 'error',
        text: 'Das geht nur mit einem Konto, das per E-Mail oder Social Login angemeldet ist.',
      });
      return;
    }
    setRunning(true);
    setNotice(null);
    setFailedAt(null);
    lastStep.current = 'idle';

    const deps = createMigrationDeps({
      signTypedData: async (typed) => (await admin.signTypedData(typed as any)) as Hex,
      maciKeypairJson: serializedKeypair ? JSON.stringify(serializedKeypair) : null,
    });
    const userName = user?.username || user?.display_name || 'Röbel-Konto';
    try {
      const res = await runPasskeyMigration({ legacy, userName }, deps, (p) => {
        if (p.step !== 'error' && p.step !== 'idle') lastStep.current = p.step;
        setStep(p.step);
        if (p.rewrap) setRewrap(p.rewrap);
      });
      const rec = await loadMigrationRecord(secureKeyValueStorage).catch(() => null);
      setRecord(rec);
      if (res.status === 'done') {
        setRewrap(res.rewrap);
        setNotice({
          tone: 'success',
          text: res.alreadyAdmin
            ? 'Dein Passkey-Konto ist bereits verbunden.'
            : 'Fertig. Dein Passkey ist jetzt zusätzlicher Verwalter deines Kontos.',
        });
      } else if (res.status === 'idle') {
        setStep('idle');
        setNotice({ tone: 'info', text: res.message });
      } else {
        setFailedAt(lastStep.current === 'idle' ? 'creatingPasskey' : lastStep.current);
        setNotice({ tone: 'error', text: res.message });
        if (__DEV__) console.warn('[passkey] migration failed:', res.detail);
      }
    } catch (e) {
      // Never an unhandled rejection (e.g. SecureStore failing after the passkey was created).
      setStep('error');
      setFailedAt(lastStep.current === 'idle' ? 'creatingPasskey' : lastStep.current);
      setNotice({
        tone: 'error',
        text: 'Etwas ist schiefgelaufen. Dein Passkey-Status konnte nicht gespeichert werden. Bitte versuche es erneut.',
      });
      if (__DEV__) console.warn('[passkey] migration threw:', e instanceof Error ? e.name : typeof e);
    } finally {
      setRunning(false);
    }
  }, [running, account?.address, wallet, serializedKeypair, user?.username, user?.display_name]);

  const states = stepStates({ step, failedAt, rewrap, hasPasskey, connected });
  const noticeColors =
    notice?.tone === 'error'
      ? { bg: colors.errorBackground, fg: colors.error }
      : notice?.tone === 'success'
        ? { bg: colors.successBackground, fg: colors.success }
        : { bg: colors.surfaceSecondary, fg: colors.textSecondary };

  const buttonLabel = hasPasskey ? 'Einrichtung fortsetzen' : 'Passkey einrichten';

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <RecoveryBanner record={connected ? record : null} />

      <Text style={[styles.lede, { color: colors.textPrimary }]}>Dein Konto, mit Passkey gesichert.</Text>
      <Text style={[styles.subLede, { color: colors.textSecondary }]}>
        Dein Konto bleibt dasselbe. Dein Passkey wird zusätzlicher Verwalter — die E-Mail-Anmeldung
        funktioniert weiterhin.
      </Text>

      <MigrationSteps states={states} rewrap={rewrap} />

      {notice && (
        <View style={[styles.notice, { backgroundColor: noticeColors.bg }]}>
          <Text style={[styles.noticeText, { color: noticeColors.fg }]}>{notice.text}</Text>
        </View>
      )}

      {connected ? (
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>STATUS</Text>
          <Text style={[styles.body, { color: colors.textPrimary }]}>
            Dein Passkey-Konto ist verbunden.
          </Text>
          {rewrap === 'skipped' && (
            <Text style={[styles.bodySmall, { color: colors.textSecondary }]}>
              Deine Schlüssel sind nicht durch den Passkey geschützt, weil dein Gerät das nicht
              unterstützt.
            </Text>
          )}
        </View>
      ) : canStart ? (
        <Pressable
          style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: running ? 0.5 : 1 }]}
          disabled={running}
          onPress={onStart}
          accessibilityRole="button"
        >
          {running ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>{buttonLabel}</Text>
          )}
        </Pressable>
      ) : null}

      <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>WIEDERHERSTELLUNG</Text>
      <PasskeyRecoverySection record={record} connected={connected} />

      {connected && <EmailRow />}

      {connected && (
        <>
          <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>SCHLÜSSEL & NACHRICHTEN</Text>
          <KeysAndMessagesSection />
        </>
      )}

      {connected || canDetach ? (
        <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>ANMELDUNG</Text>
      ) : null}
      {connected && <PasskeySessionSwitch />}
      {connected && canDetach ? (
        <Pressable
          style={[styles.card, { backgroundColor: colors.surface }]}
          onPress={() => router.push('/settings/passkey-detach' as any)}
          accessibilityRole="button"
        >
          <Text style={[styles.body, { color: colors.textPrimary }]}>Unabhängig werden</Text>
          <Text style={[styles.bodySmall, { color: colors.textSecondary }]}>
            Endgültig. Erst möglich, wenn alle Punkte der Checkliste erfüllt sind.
          </Text>
        </Pressable>
      ) : canDetach ? (
        <View
          style={[styles.card, styles.disabledRow, { backgroundColor: colors.surface }]}
          accessibilityState={{ disabled: true }}
        >
          <Text style={[styles.body, { color: colors.textTertiary }]}>E-Mail-Anmeldung entfernen — erst nach der Einrichtung</Text>
        </View>
      ) : null}
    </ScrollView>
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
  },
  headerTitle: { fontFamily: fontFamily.semiBold, fontSize: 17 },
  headerSpacer: { width: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  content: { padding: 16, paddingBottom: 56, gap: 14 },
  lede: { fontFamily: fontFamily.heading, fontSize: 26, lineHeight: 31 },
  subLede: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 22, marginTop: -6 },
  card: { borderRadius: 16, padding: 16 },
  cardLabel: { fontFamily: fontFamily.medium, fontSize: 11, letterSpacing: 0.6, marginBottom: 6 },
  body: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 21 },
  bodySmall: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 19, marginTop: 6 },
  sectionHeading: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    letterSpacing: 0.6,
    marginTop: 6,
    marginLeft: 4,
  },
  notice: { borderRadius: 12, padding: 12 },
  noticeText: { fontFamily: fontFamily.medium, fontSize: 13, lineHeight: 19 },
  primaryButton: { borderRadius: 999, paddingVertical: 16, alignItems: 'center' },
  primaryButtonText: { fontFamily: fontFamily.semiBold, fontSize: 15, color: '#fff' },
  disabledRow: { opacity: 0.6 },
});
