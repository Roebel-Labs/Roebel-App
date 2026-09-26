import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useActiveAccount, useActiveWallet } from 'thirdweb/react';
import type { Address, Hex } from 'viem';

import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { useMaci } from '@/context/MaciContext';
import { fontFamily } from '@/constants/theme';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import MigrationSteps, { stepStates } from '@/components/passkey/MigrationSteps';
import { isPasskeyPreviewAllowed } from '@/lib/passkey/gate';
import {
  loadMigrationRecord,
  runPasskeyMigration,
  type MigrationRecord,
  type MigrationStep,
  type RewrapStatus,
} from '@/lib/passkey/migration';
import { createMigrationDeps, secureKeyValueStorage } from '@/lib/passkey/migration-runtime';

type Notice = { tone: 'info' | 'error' | 'success'; text: string } | null;

export default function PasskeySettingsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { user } = useUser();
  const { serializedKeypair } = useMaci();
  const account = useActiveAccount();
  const wallet = useActiveWallet();

  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [record, setRecord] = useState<MigrationRecord | null>(null);
  const [step, setStep] = useState<MigrationStep>('idle');
  const [failedAt, setFailedAt] = useState<MigrationStep | null>(null);
  const [rewrap, setRewrap] = useState<RewrapStatus | undefined>(undefined);
  const [notice, setNotice] = useState<Notice>(null);
  const [running, setRunning] = useState(false);
  const lastStep = useRef<MigrationStep>('idle');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [ok, rec] = await Promise.all([
        isPasskeyPreviewAllowed().catch(() => false),
        loadMigrationRecord(secureKeyValueStorage).catch(() => null),
      ]);
      if (cancelled) return;
      setAllowed(ok);
      setRecord(rec);
      if (rec?.rewrap) setRewrap(rec.rewrap);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Passkey & Wiederherstellung</Text>
        <View style={styles.headerSpacer} />
      </View>

      {allowed === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : !allowed ? (
        <View style={styles.center}>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            Diese Funktion ist noch nicht verfügbar.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
          ) : (
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
          )}

          <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>WIEDERHERSTELLUNG</Text>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <Text style={[styles.body, { color: colors.textSecondary }]}>
              Vertrauenspersonen einrichten — kommt im nächsten Schritt
            </Text>
          </View>

          <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>ANMELDUNG</Text>
          <View
            style={[styles.card, styles.disabledRow, { backgroundColor: colors.surface }]}
            accessibilityState={{ disabled: true }}
          >
            <Text style={[styles.body, { color: colors.textTertiary }]}>E-Mail-Anmeldung entfernen — kommt bald</Text>
          </View>
        </ScrollView>
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
