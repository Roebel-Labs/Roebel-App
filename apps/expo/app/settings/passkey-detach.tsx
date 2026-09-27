/**
 * Settings → Passkey & Wiederherstellung → "thirdweb trennen" (PREVIEW-GATED, irreversible).
 *
 * A live checklist (lib/passkey/detach.ts evaluateDetachChecklist) must be all green; then a plain
 * German explanation, typing "TRENNEN" and a fingerprint. The thirdweb admin EOA signs its own
 * removal (so this step needs an active Google/E-Mail session), the passkey Safe submits it as one
 * sponsored op (server mode "detach"), the result is verified on chain, and only then is the
 * thirdweb session cleared on this device and the app switched to the passkey session.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useActiveAccount, useActiveWallet, useSetActiveWallet } from 'thirdweb/react';
import type { Address, Hex } from 'viem';

import { useTheme } from '@/context/ThemeContext';
import { useXmtp } from '@/context/XmtpContext';
import { fontFamily } from '@/constants/theme';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import { isPasskeyPreviewAllowed } from '@/lib/passkey/gate';
import { passkeySessionOf } from '@/lib/passkey/active';
import {
  DETACH_CONFIRM_WORD,
  DETACH_EXPLANATION,
  DETACH_NEEDS_THIRDWEB_MESSAGE,
  evaluateDetachChecklist,
  sponsoredOpSucceededThisSession,
  type ChecklistId,
} from '@/lib/passkey/detach';
import type { KeyBackupSlot } from '@/lib/passkey/key-backup';
import type { PasskeySession } from '@/lib/passkey/session';

type Busy = ChecklistId | 'detach' | null;

export default function PasskeyDetachScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const account = useActiveAccount();
  const wallet = useActiveWallet();
  const setActiveWallet = useSetActiveWallet();
  const { linkPasskey } = useXmtp();

  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [session, setSession] = useState<PasskeySession | null>(null);
  const [guardians, setGuardians] = useState<{ count: number; threshold: number } | null>(null);
  const [xmtpLinked, setXmtpLinked] = useState<boolean | null>(null);
  const [synced, setSynced] = useState(false);
  const [noDms, setNoDms] = useState(false);
  const [opOk, setOpOk] = useState(sponsoredOpSucceededThisSession());
  const [keys, setKeys] = useState<{ local: KeyBackupSlot[]; backup: KeyBackupSlot[] | null }>({ local: [], backup: null });
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [done, setDone] = useState(false);

  const admin = wallet && wallet.id === 'inApp' ? wallet.getAdminAccount?.() : undefined;

  const refresh = useCallback(async (s: PasskeySession) => {
    const rt = await import('@/lib/passkey/detach-runtime');
    const { isPasskeySafeLinkedToInbox } = await import('@/lib/xmtp/client');
    const [g, x] = await Promise.all([
      rt.guardianCounts(s.safe).catch(() => null),
      isPasskeySafeLinkedToInbox(s).catch(() => null),
    ]);
    setGuardians(g);
    setXmtpLinked(x);
    setOpOk(sponsoredOpSucceededThisSession());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await isPasskeyPreviewAllowed().catch(() => false);
      if (cancelled) return;
      setAllowed(ok);
      if (!ok) return;
      const rt = await import('@/lib/passkey/detach-runtime');
      const s = await rt.actingPasskeySession(passkeySessionOf<PasskeySession>(account), account?.address as Address | undefined);
      if (cancelled) return;
      setSession(s);
      if (s) await refresh(s);
    })();
    return () => {
      cancelled = true;
    };
  }, [account, refresh]);

  const checklist = useMemo(
    () =>
      evaluateDetachChecklist({
        passkeySyncedConfirmed: synced,
        guardians,
        xmtpLinked,
        noDmsConfirmed: noDms,
        sponsoredOpSucceeded: opOk,
        localKeySlots: keys.local,
        backupSlots: keys.backup,
      }),
    [synced, guardians, xmtpLinked, noDms, opOk, keys],
  );

  const act = async (id: Busy, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(id);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Das hat nicht geklappt. Bitte versuche es erneut.');
    } finally {
      setBusy(null);
    }
  };

  const onTest = () =>
    act('testAction', async () => {
      const rt = await import('@/lib/passkey/detach-runtime');
      await rt.runPasskeyTestAction(session as PasskeySession);
      setOpOk(true);
    });

  const onLink = () =>
    act('messages', async () => {
      await linkPasskey(session as PasskeySession);
      setXmtpLinked(true);
    });

  const onBackup = () =>
    act('keyBackup', async () => {
      const rt = await import('@/lib/passkey/detach-runtime');
      const r = await rt.backupKeysForSession(session as PasskeySession);
      if (r.status === 'disabled') throw new Error('Die Schlüssel-Sicherung ist noch nicht freigeschaltet.');
      if (r.conflicts.length > 0) throw new Error('Auf dem Server liegt bereits ein anderer Schlüssel. Bitte melde dich bei uns.');
      // The report already says what the server holds for every slot this device has (no 3rd fingerprint).
      setKeys({ local: [...r.saved, ...r.conflicts], backup: r.saved });
    });

  const onDetach = () =>
    act('detach', async () => {
      if (!session || !admin) throw new Error(DETACH_NEEDS_THIRDWEB_MESSAGE);
      const rt = await import('@/lib/passkey/detach-runtime');
      const res = await rt.detachThirdweb({
        session,
        eoa: admin.address as Address,
        signTypedDataAsEoa: async (t) => (await admin.signTypedData(t as any)) as Hex,
      });
      if (res.status === 'otherAdmins') {
        throw new Error(
          `Dein Konto hat noch ${res.admins.length} weitere${res.admins.length === 1 ? 'n' : ''} Verwalter ` +
            `(${res.admins.map((a) => `endet auf …${a.slice(-4)}`).join(', ')}). Es wurde nichts unterschrieben. ` +
            'Bitte melde dich bei uns, bevor du trennst.',
        );
      }
      if (res.status === 'error') throw new Error(res.message);
      // Verified on chain: the thirdweb login no longer controls the account. Switch this device
      // to the passkey session FIRST, then clear the (now powerless) thirdweb session locally.
      const signin = await import('@/lib/passkey/signin-runtime');
      const { savePasskeySession } = await import('@/lib/passkey/session');
      await savePasskeySession(signin.secureSessionStorage, session);
      const previous = wallet;
      await signin.activatePasskeySession(session, setActiveWallet);
      if (previous && previous.id === 'inApp') await previous.disconnect().catch(() => undefined);
      setDone(true);
    });

  const isLegacy = !!session && session.identity.toLowerCase() !== session.safe.toLowerCase();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Google/E-Mail-Anmeldung trennen</Text>
        <View style={styles.headerSpacer} />
      </View>

      {allowed === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : !allowed ? (
        <View style={styles.center}>
          <Text style={[styles.body, { color: colors.textSecondary }]}>Diese Funktion ist noch nicht verfügbar.</Text>
        </View>
      ) : done ? (
        <View style={styles.center}>
          <Text style={[styles.lede, { color: colors.textPrimary }]}>Getrennt.</Text>
          <Text style={[styles.body, { color: colors.textSecondary, textAlign: 'center' }]}>
            Dein Konto gehört jetzt nur noch deinem Passkey und deinen Vertrauenspersonen.
          </Text>
        </View>
      ) : !session || !isLegacy ? (
        <View style={styles.center}>
          <Text style={[styles.body, { color: colors.textSecondary, textAlign: 'center' }]}>
            {session
              ? 'Dein Konto hat keine Google/E-Mail-Anmeldung, die getrennt werden müsste.'
              : 'Richte zuerst deinen Passkey ein.'}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={[styles.subLede, { color: colors.textSecondary }]}>
            Bevor deine bisherige Anmeldung getrennt werden kann, muss alles hier grün sein.
          </Text>

          {checklist.items.map((item) => (
            <View key={item.id} style={[styles.card, { backgroundColor: colors.surface }]}>
              <View style={styles.row}>
                <Text style={[styles.dot, { color: item.ok ? colors.success : colors.textTertiary }]}>{item.ok ? '●' : '○'}</Text>
                <Text style={[styles.title, { color: colors.textPrimary }]}>{item.title}</Text>
              </View>
              <Text style={[styles.small, { color: colors.textSecondary }]}>{item.detail}</Text>
              {item.id === 'passkeySynced' && (
                <Toggle label="Ich habe geprüft: Mein Passkey ist gesichert" value={synced} onChange={setSynced} />
              )}
              {item.id === 'guardians' && !item.ok && (
                <Text style={[styles.small, { color: colors.textSecondary }]}>
                  Füge unter „Wiederherstellung“ Vertrauenspersonen hinzu und stelle „2 müssen zustimmen“ ein.
                </Text>
              )}
              {item.id === 'messages' && !item.ok && (
                <>
                  <ActionButton label="Nachrichten auf Passkey übertragen" busy={busy === 'messages'} disabled={!!busy} onPress={onLink} />
                  <Toggle label="Ich nutze keine Direktnachrichten" value={noDms} onChange={setNoDms} />
                </>
              )}
              {item.id === 'testAction' && !item.ok && (
                <ActionButton label="Test ausführen" busy={busy === 'testAction'} disabled={!!busy} onPress={onTest} />
              )}
              {item.id === 'keyBackup' && !item.ok && (
                <ActionButton label="Schlüssel sichern & prüfen" busy={busy === 'keyBackup'} disabled={!!busy} onPress={onBackup} />
              )}
            </View>
          ))}

          {error && (
            <View style={[styles.notice, { backgroundColor: colors.errorBackground }]}>
              <Text style={[styles.small, { color: colors.error }]}>{error}</Text>
            </View>
          )}

          {checklist.allGreen && (
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <Text style={[styles.title, { color: colors.textPrimary }]}>Was jetzt passiert</Text>
              <Text style={[styles.body, { color: colors.textPrimary }]}>{DETACH_EXPLANATION}</Text>
              {!admin ? (
                <Text style={[styles.small, { color: colors.error }]}>{DETACH_NEEDS_THIRDWEB_MESSAGE}</Text>
              ) : (
                <>
                  <Text style={[styles.small, { color: colors.textSecondary }]}>
                    Tippe {DETACH_CONFIRM_WORD}, um zu bestätigen. Danach fragt dein Telefon nach deinem Fingerabdruck.
                  </Text>
                  <TextInput
                    value={typed}
                    onChangeText={setTyped}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    placeholder={DETACH_CONFIRM_WORD}
                    placeholderTextColor={colors.textTertiary}
                    style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
                    accessibilityLabel={`Zum Bestätigen ${DETACH_CONFIRM_WORD} eingeben`}
                  />
                  <ActionButton
                    label="Endgültig trennen"
                    danger
                    busy={busy === 'detach'}
                    disabled={!!busy || typed.trim() !== DETACH_CONFIRM_WORD}
                    onPress={onDetach}
                  />
                </>
              )}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      style={styles.row}
      hitSlop={8}
    >
      <View style={[styles.box, { borderColor: value ? colors.primary : colors.border, backgroundColor: value ? colors.primary : 'transparent' }]}>
        {value && <Text style={styles.check}>✓</Text>}
      </View>
      <Text style={[styles.small, { color: colors.textPrimary, flex: 1 }]}>{label}</Text>
    </Pressable>
  );
}

function ActionButton(p: { label: string; busy: boolean; disabled: boolean; onPress: () => void; danger?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={p.onPress}
      disabled={p.disabled}
      accessibilityRole="button"
      style={[styles.button, { backgroundColor: p.danger ? colors.error : colors.primary, opacity: p.disabled ? 0.5 : 1 }]}
    >
      {p.busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{p.label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  headerTitle: { fontFamily: fontFamily.semiBold, fontSize: 17 },
  headerSpacer: { width: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  content: { padding: 16, paddingBottom: 56, gap: 14 },
  lede: { fontFamily: fontFamily.heading, fontSize: 26, lineHeight: 31 },
  subLede: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 22 },
  card: { borderRadius: 16, padding: 16, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { fontSize: 14, width: 16 },
  title: { fontFamily: fontFamily.semiBold, fontSize: 15, flex: 1 },
  body: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 21 },
  small: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 19 },
  notice: { borderRadius: 12, padding: 12 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontFamily: fontFamily.semiBold, fontSize: 16, letterSpacing: 2 },
  button: { borderRadius: 999, minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  buttonText: { fontFamily: fontFamily.semiBold, fontSize: 15, color: '#fff' },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  check: { color: '#fff', fontSize: 13, fontFamily: fontFamily.bold },
});
