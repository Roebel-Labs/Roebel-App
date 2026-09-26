/**
 * Security banner: someone is recovering MY passkey Safe (a pending SRM request whose new owner
 * is not this device's owner). Red, unmissable, one action: cancel (encodeCancelRecovery, one
 * sponsored op from my Safe, one fingerprint).
 *
 * `RecoveryBanner` is used on the passkey screen (re-checked on focus). `RecordRecoveryWatch` is
 * the root-layout variant, loaded by PasskeyRecoveryWatch only after the preview gate opened, and
 * rendered only when a local migration record exists — so production users are untouched.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { encodeCancelRecovery, type RecoveryRequest } from '@/lib/passkey/guardians';
import { loadMigrationRecord, type MigrationRecord } from '@/lib/passkey/migration';
import { secureKeyValueStorage } from '@/lib/passkey/migration-runtime';
import { formatRemaining, isForeignRecoveryPending } from '@/lib/passkey/recovery-flow';
import { readIdentityMode, readRecoveryRequestSafe, sendOwnSafeOp } from '@/lib/passkey/guardians-runtime';
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
      <Text style={styles.title}>Jemand stellt gerade dein Konto wieder her.</Text>
      <Text style={styles.body}>
        Warst du das nicht? Dann brich es jetzt ab. {remaining > 0 ? `${formatRemaining(remaining)} Zeit.` : ''}
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <BigButton
        label="Jetzt abbrechen"
        onPress={onCancel}
        busy={phase === 'cancelling'}
        kind="secondary"
        style={styles.button}
      />
    </View>
  );
}

/**
 * Loaded by PasskeyRecoveryWatch only after the preview gate opened: renders the floating banner
 * when this device holds a connected passkey record.
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
  if (!record) return null;
  return <BannerCore record={record} floating />;
}

const styles = StyleSheet.create({
  box: { borderRadius: 16, padding: 16, gap: 10 },
  floating: { position: 'absolute', left: 12, right: 12, zIndex: 1000, elevation: 12 },
  title: { fontFamily: fontFamily.bold, fontSize: 18, lineHeight: 24, color: '#fff' },
  body: { fontFamily: fontFamily.medium, fontSize: 16, lineHeight: 22, color: '#fff' },
  error: { fontFamily: fontFamily.medium, fontSize: 14, lineHeight: 20, color: '#fff' },
  button: { backgroundColor: '#fff', borderColor: '#fff' },
});
