/**
 * Security banner: someone is recovering MY passkey Safe (a pending SRM request whose new owner
 * is not this device's owner). Red, unmissable, one action: cancel (encodeCancelRecovery, one
 * sponsored op from my Safe, one fingerprint).
 *
 * `RecoveryBanner` is used on the passkey screen (re-checked on focus). `RecordRecoveryWatch` is
 * the root-layout variant, loaded by PasskeyRecoveryWatch only after its gate opened
 * (lib/passkey/existing-account.ts): the banner when a connected local migration record exists,
 * and the replaced-session notice when the active passkey session's owner was removed from its
 * Safe (a recovery finished on another device). Only a confirmed `replaced` ends the session;
 * a failed read never does (lib/passkey/session-health.ts).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, StyleSheet, Text, View } from 'react-native';
import { useActiveAccount, useActiveWallet, useDisconnect } from 'thirdweb/react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { encodeCancelRecovery, readRecoveryRequest, type RecoveryRequest } from '@/lib/passkey/guardians';
import { isPasskeyWallet, passkeySessionOf } from '@/lib/passkey/active';
import type { PasskeySession } from '@/lib/passkey/session';
import { confirmedSessionOwnerState, createOwnerSeenStore } from '@/lib/passkey/session-health';
import { isSafeDeployed } from '@/lib/passkey/userop';
import { loadMigrationRecord, type MigrationRecord } from '@/lib/passkey/migration';
import { secureKeyValueStorage } from '@/lib/passkey/migration-runtime';
import { formatRemaining, isForeignRecoveryPending } from '@/lib/passkey/recovery-flow';
import { readIdentityMode, readRecoveryRequestSafe, readSafeOwners, sendOwnSafeOp } from '@/lib/passkey/guardians-runtime';
import { BigButton, friendlyError } from './PasskeyUi';

type Phase = 'hidden' | 'pending' | 'cancelling' | 'cancelled';

function useForeignRecovery(record: MigrationRecord | null) {
  const [request, setRequest] = useState<RecoveryRequest | null>(null);
  const check = useCallback(async () => {
    if (!record) return setRequest(null);
    setRequest(await readRecoveryRequestSafe(record.safe));
  }, [record]);
  const pending = !!record && isForeignRecoveryPending(request, record.owner);
  return { request, pending, check };
}

/** Screen variant: re-checks whenever the screen gains focus. */
export function RecoveryBanner({ record }: { record: MigrationRecord | null }) {
  const [tick, setTick] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setTick((t) => t + 1);
    }, []),
  );
  return <BannerCore record={record} refreshKey={tick} />;
}

/**
 * No navigation hooks in here: the root watcher renders it outside any screen (a focus hook
 * there would crash, see reference_expo_router_use_is_focused).
 */
function BannerCore({
  record,
  floating = false,
  refreshKey = 0,
}: {
  record: MigrationRecord | null;
  floating?: boolean;
  refreshKey?: number;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { request, pending, check } = useForeignRecovery(record);
  const [phase, setPhase] = useState<Phase>('hidden');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    check().catch(() => undefined);
  }, [check, refreshKey]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') check().catch(() => undefined);
    });
    return () => sub.remove();
  }, [check]);

  useEffect(() => {
    if (pending && phase === 'hidden') setPhase('pending');
    if (!pending && phase === 'pending') setPhase('hidden');
  }, [pending, phase]);

  const onCancel = useCallback(async () => {
    if (!record) return;
    setError(null);
    setPhase('cancelling');
    try {
      const mode = await readIdentityMode(record);
      if (!mode) {
        setError('Das Abbrechen ist gerade nicht möglich. Bitte melde dich bei deinen Vertrauenspersonen.');
        setPhase('pending');
        return;
      }
      await sendOwnSafeOp(record, mode, [encodeCancelRecovery()]);
      setPhase('cancelled');
      await check();
    } catch (e) {
      const msg = friendlyError(e);
      if (msg) setError(msg);
      setPhase('pending');
    }
  }, [record, check]);

  if (phase === 'hidden') return null;

  if (phase === 'cancelled') {
    return (
      <View style={[styles.box, { backgroundColor: colors.successBackground }, floating && [styles.floating, { top: insets.top + 8 }]]}>
        <Text style={[styles.title, { color: colors.success }]}>Abgebrochen. Dein Konto ist sicher.</Text>
      </View>
    );
  }

  const remaining = request ? Number(request.executeAfter) - Math.floor(Date.now() / 1000) : 0;
  return (
    <View
      style={[styles.box, { backgroundColor: colors.error }, floating && [styles.floating, { top: insets.top + 8 }]]}
      accessibilityRole="alert"
    >
      <Text style={styles.title}>Jemand stellt dein Konto wieder her</Text>
      <Text style={styles.body}>
        Warst du das nicht? Dann brich es jetzt ab. {remaining > 0 ? `${formatRemaining(remaining)} Zeit.` : ''}
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <BigButton
        label="Das war ich nicht – abbrechen"
        onPress={onCancel}
        busy={phase === 'cancelling'}
        kind="secondary"
        style={styles.button}
      />
    </View>
  );
}

const sessionHealthDeps = {
  isDeployed: (safe: PasskeySession['safe']) => isSafeDeployed(safe),
  readOwners: readSafeOwners,
  readRequest: (safe: PasskeySession['safe']) => readRecoveryRequest(safe),
  seen: createOwnerSeenStore(secureKeyValueStorage),
  wait: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
};

/**
 * Blocking notice when the active passkey session's owner is no longer an owner of its Safe.
 * Checked on mount, on every session change and whenever the app comes to the foreground. A
 * single read never shows it: the session must have been seen as an owner before, and a second
 * read ~45 s later must agree (confirmedSessionOwnerState), so a lagging RPC node cannot sign
 * anyone out.
 * "Verstanden" disconnects the passkey wallet: the existing logout path, which deletes only
 * `passkey_session_v1` (signin-runtime.ts createPasskeyWallet).
 */
function ReplacedSessionNotice() {
  const { colors } = useTheme();
  const wallet = useActiveWallet();
  const account = useActiveAccount();
  const { disconnect } = useDisconnect();
  const session = isPasskeyWallet(wallet) ? passkeySessionOf<PasskeySession>(account) : null;
  const safe = session?.safe ?? null;
  const owner = session?.owner ?? null;
  const key = safe && owner ? `${safe}:${owner}` : null;
  // The session (safe:owner) confirmed as replaced; a different session never shows the notice.
  const [replacedKey, setReplacedKey] = useState<string | null>(null);
  const currentKey = useRef<string | null>(null);
  const checking = useRef<string | null>(null); // the key whose check is running

  useEffect(() => {
    currentKey.current = key;
    if (!safe || !owner || !key) return;
    const check = () => {
      if (checking.current === key) return;
      checking.current = key;
      confirmedSessionOwnerState({ safe, owner }, sessionHealthDeps)
        .then((state) => {
          // Only a confirmed replacement of THIS session counts; 'unknown' never logs anyone out.
          if (state === 'replaced' && currentKey.current === key) setReplacedKey(key);
        })
        .catch(() => undefined)
        .finally(() => {
          if (checking.current === key) checking.current = null;
        });
    };
    check();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') check();
    });
    return () => sub.remove();
  }, [safe, owner, key]);

  const onUnderstood = useCallback(() => {
    setReplacedKey(null);
    if (wallet && isPasskeyWallet(wallet)) disconnect(wallet);
  }, [wallet, disconnect]);

  if (!key || replacedKey !== key) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => undefined}>
      <View style={styles.backdrop}>
        <View style={[styles.notice, { backgroundColor: colors.surface }]} accessibilityRole="alert">
          <Text style={[styles.noticeText, { color: colors.textPrimary }]}>
            Dieses Konto wurde auf einem anderen Gerät wiederhergestellt. Auf diesem Gerät bist du jetzt abgemeldet.
          </Text>
          <BigButton label="Verstanden" onPress={onUnderstood} />
        </View>
      </View>
    </Modal>
  );
}

/**
 * Loaded by PasskeyRecoveryWatch only after its gate opened: renders the floating banner
 * when this device holds a connected passkey record, and the replaced-session notice.
 */
export function RecordRecoveryWatch() {
  const [record, setRecord] = useState<MigrationRecord | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let cancelled = false;
    loadMigrationRecord(secureKeyValueStorage)
      .catch(() => null)
      .then((rec) => {
        if (!cancelled && rec?.status === 'done') setRecord(rec);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <>
      {record ? <BannerCore record={record} floating /> : null}
      <ReplacedSessionNotice />
    </>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 16, padding: 16, gap: 10 },
  floating: { position: 'absolute', left: 12, right: 12, zIndex: 1000, elevation: 12 },
  title: { fontFamily: fontFamily.bold, fontSize: 18, lineHeight: 24, color: '#fff' },
  body: { fontFamily: fontFamily.medium, fontSize: 16, lineHeight: 22, color: '#fff' },
  error: { fontFamily: fontFamily.medium, fontSize: 14, lineHeight: 20, color: '#fff' },
  button: { backgroundColor: '#fff', borderColor: '#fff' },
  backdrop: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.5)' },
  notice: { borderRadius: 16, padding: 20, gap: 16 },
  noticeText: { fontFamily: fontFamily.semiBold, fontSize: 18, lineHeight: 25 },
});
