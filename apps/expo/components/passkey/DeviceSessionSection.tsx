/**
 * Settings section "Gerät ohne Fingerabdruck": this device's mint-only session (device session).
 * Shows active / expired / off / another device, grants (one fingerprint) or ends it.
 * Hidden unless the account is eligible (passkey owner, legacy identity, native) and the state
 * is readable. Kill switch off: only a live session is shown, so it can still be ended.
 * Never renders an address or key.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import type { PasskeySession } from '@/lib/passkey/session';
import { fetchPasskeySessionKeysEnabled } from '@/lib/supabase-app-settings';
import { isDeviceSessionEligible } from '@/lib/passkey/session-keys/claim-route';
import {
  grantDeviceSession,
  readDeviceSessionState,
  revokeDeviceSessions,
} from '@/lib/passkey/session-keys/grant';
import { deviceSessionView, formatSessionDate, type DeviceSessionView } from '@/lib/passkey/session-keys/ui-state';
import { BigButton, Card, Notice, friendlyError, passkeyStyles } from '@/components/passkey/PasskeyUi';

const REVOKED_NOTICE = 'Beendet. Beim Abholen fragen wir wieder nach deinem Fingerabdruck.';
const EXPLAINER =
  'Die App darf 30 Tage lang nur auf diesem Gerät Röbel Münzen für dich abholen, ohne Fingerabdruck. Senden, Abstimmen und alles andere fragen weiter nach deinem Fingerabdruck.';

export default function DeviceSessionSection({ session }: { session: PasskeySession | null }) {
  const { colors } = useTheme();
  const eligible = isDeviceSessionEligible(session, Platform.OS);
  const [view, setView] = useState<DeviceSessionView>({ kind: 'hidden' });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!session || !eligible) return;
    let cancelled = false;
    (async () => {
      try {
        const [enabled, state] = await Promise.all([fetchPasskeySessionKeysEnabled(), readDeviceSessionState(session)]);
        if (!cancelled) setView(deviceSessionView({ enabled, eligible, state, nowSec: Math.floor(Date.now() / 1000) }));
      } catch {
        if (!cancelled) setView({ kind: 'hidden' }); // unreadable (RPC, undeployed): show nothing
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, eligible, reload]);

  const grant = useCallback(async () => {
    if (!session) return;
    setBusy(true);
    setNotice(null);
    try {
      await grantDeviceSession(session);
    } catch (e) {
      const msg = friendlyError(e);
      if (msg) setNotice({ tone: 'error', text: msg });
    } finally {
      setBusy(false);
      setReload((n) => n + 1);
    }
  }, [session]);

  const revoke = useCallback(async () => {
    if (!session) return;
    setBusy(true);
    setNotice(null);
    try {
      await revokeDeviceSessions(session);
      setNotice({ tone: 'success', text: REVOKED_NOTICE });
    } catch (e) {
      const msg = friendlyError(e);
      if (msg) setNotice({ tone: 'error', text: msg });
    } finally {
      setBusy(false);
      setReload((n) => n + 1);
    }
  }, [session]);

  const confirmRevoke = useCallback(() => {
    Alert.alert('Gerät ohne Fingerabdruck beenden?', 'Beim Abholen fragen wir dann wieder nach deinem Fingerabdruck.', [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Beenden', style: 'destructive', onPress: () => void revoke() },
    ]);
  }, [revoke]);

  if (!eligible || (view.kind === 'hidden' && !notice)) return null;

  let status: string | null = null;
  let body: string | null = null;
  let action: { label: string; onPress: () => void; kind: 'primary' | 'secondary' } | null = null;
  switch (view.kind) {
    case 'active':
      status = `Gerät ohne Fingerabdruck: aktiv bis ${formatSessionDate(view.until)}`;
      body =
        'Diese App darf auf diesem Gerät Röbel Münzen für dich abholen, ohne nach deinem Fingerabdruck zu fragen. Für alles andere fragen wir weiter nach deinem Fingerabdruck.';
      action = { label: 'Jetzt beenden', onPress: confirmRevoke, kind: 'secondary' };
      break;
    case 'expired':
      status = 'Gerät ohne Fingerabdruck: abgelaufen';
      body = EXPLAINER;
      action = { label: 'Erneut erlauben', onPress: () => void grant(), kind: 'primary' };
      break;
    case 'off':
      status = 'Gerät ohne Fingerabdruck: aus';
      body = EXPLAINER;
      action = { label: 'Erlauben', onPress: () => void grant(), kind: 'primary' };
      break;
    case 'other':
      status = `Auf einem anderen Gerät aktiv bis ${formatSessionDate(view.until)}`;
      body = 'Dort darf die App Röbel Münzen ohne Fingerabdruck abholen. Auf diesem Gerät fragen wir weiter nach deinem Fingerabdruck.';
      action = { label: 'Beenden', onPress: confirmRevoke, kind: 'secondary' };
      break;
    default:
      break;
  }

  return (
    <View style={styles.wrap}>
      <Text style={[passkeyStyles.sectionHeading, styles.heading, { color: colors.textSecondary }]}>Gerät ohne Fingerabdruck</Text>
      {notice ? <Notice tone={notice.tone} text={notice.text} /> : null}
      {status ? (
        <Card style={styles.card}>
          <Text style={[styles.status, { color: colors.textPrimary }]}>{status}</Text>
          {body ? <Text style={[passkeyStyles.bodySmall, { color: colors.textSecondary }]}>{body}</Text> : null}
          {action ? <BigButton label={action.label} onPress={action.onPress} kind={action.kind} busy={busy} /> : null}
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  // Same look as the other section headings (written in capitals there).
  heading: { textTransform: 'uppercase' },
  card: { gap: 10 },
  status: { fontFamily: fontFamily.semiBold, fontSize: 16, lineHeight: 22 },
});
