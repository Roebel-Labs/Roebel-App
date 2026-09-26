/**
 * "E-Mail für Warnungen (optional)": add / verify-code / remove the warning email of this device's
 * passkey Safe. Self-contained (loads the migration record itself) so the settings screen only
 * mounts it. Renders nothing until the passkey Safe is set up.
 *
 * The email is only for warnings (a recovery of the account, opted-in notices). It is never a
 * sign-in and never a key. See lib/passkey/email.ts.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { loadMigrationRecord, type MigrationRecord } from '@/lib/passkey/migration';
import { secureKeyValueStorage } from '@/lib/passkey/migration-runtime';
import {
  PasskeyEmailError,
  confirmEmailCode,
  emailErrorMessage,
  loadEmailState,
  removeWarningEmail,
  requestEmailCode,
  saveEmailState,
  type EmailState,
} from '@/lib/passkey/email';

type Mode = 'view' | 'enterEmail' | 'enterCode';

function messageOf(e: unknown): string | null {
  if (e instanceof PasskeyEmailError) return e.code === 'cancelled' ? null : e.message;
  return emailErrorMessage('unknown');
}

export default function EmailRow() {
  const { colors } = useTheme();
  const [record, setRecord] = useState<MigrationRecord | null>(null);
  const [state, setState] = useState<EmailState | null>(null);
  const [mode, setMode] = useState<Mode>('view');
  const [emailInput, setEmailInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rec = await loadMigrationRecord(secureKeyValueStorage).catch(() => null);
      if (cancelled || !rec || rec.status !== 'done') return;
      const s = await loadEmailState(secureKeyValueStorage, rec.safe).catch(() => null);
      if (cancelled) return;
      setRecord(rec);
      setState(s ?? { safe: rec.safe, verified: null, pending: null });
      if (s?.pending && s.pending.expiresAt * 1000 > Date.now()) setMode('enterCode');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(async (next: EmailState) => {
    setState(next);
    await saveEmailState(secureKeyValueStorage, next).catch(() => undefined);
  }, []);

  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await fn();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }, []);

  if (!record || !state) return null;
  const signer = { credentialId: record.credentialId, safe: record.safe, owner: record.owner };

  const onSendCode = () =>
    run(async () => {
      const { email, expiresAt } = await requestEmailCode(signer, emailInput);
      await persist({ ...state, pending: { email, expiresAt } });
      setCodeInput('');
      setMode('enterCode');
      setInfo(`Wir haben dir einen Code an ${email} geschickt.`);
    });

  const onConfirm = () =>
    run(async () => {
      if (!state.pending) return;
      await confirmEmailCode(record.safe, codeInput);
      await persist({ safe: state.safe, verified: state.pending.email, pending: null });
      setMode('view');
      setInfo('Bestätigt. Wir warnen dich an diese Adresse.');
    });

  const onRemove = () =>
    run(async () => {
      await removeWarningEmail(signer);
      await persist({ safe: state.safe, verified: null, pending: null });
      setMode('view');
      setInfo('Die E-Mail-Adresse ist entfernt.');
    });

  const onCancelEdit = () => {
    setMode('view');
    setError(null);
    setInfo(null);
    if (state.pending) void persist({ ...state, pending: null });
  };

  const inputStyle = [styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.background }];

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>E-Mail für Warnungen (optional)</Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>
        Stellt jemand dein Konto wieder her, warnen wir dich per E-Mail. Dann hast du 3 Tage Zeit, das abzubrechen.
        Die Adresse ist nie eine Anmeldung und kein Schlüssel. Einen Newsletter bekommst du dadurch nicht.
      </Text>

      {mode === 'view' && (
        <>
          {state.verified ? (
            <Text style={[styles.value, { color: colors.textPrimary }]}>{state.verified}</Text>
          ) : null}
          <View style={styles.row}>
            <Pressable
              style={[styles.button, { backgroundColor: colors.primary, opacity: busy ? 0.5 : 1 }]}
              disabled={busy}
              onPress={() => {
                setEmailInput('');
                setError(null);
                setInfo(null);
                setMode('enterEmail');
              }}
              accessibilityRole="button"
            >
              <Text style={[styles.buttonText, { color: colors.onPrimary }]}>
                {state.verified ? 'Ändern' : 'E-Mail hinzufügen'}
              </Text>
            </Pressable>
            {state.verified ? (
              <Pressable style={styles.linkButton} disabled={busy} onPress={onRemove} accessibilityRole="button">
                {busy ? (
                  <ActivityIndicator color={colors.error} />
                ) : (
                  <Text style={[styles.linkText, { color: colors.error }]}>Entfernen</Text>
                )}
              </Pressable>
            ) : null}
          </View>
        </>
      )}

      {mode === 'enterEmail' && (
        <>
          <TextInput
            style={inputStyle}
            value={emailInput}
            onChangeText={setEmailInput}
            placeholder="name@beispiel.de"
            placeholderTextColor={colors.textTertiary}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            editable={!busy}
          />
          <Text style={[styles.hint, { color: colors.textTertiary }]}>
            Zum Bestätigen fragt dich dein Gerät nach deinem Passkey.
          </Text>
          <View style={styles.row}>
            <Pressable
              style={[styles.button, { backgroundColor: colors.primary, opacity: busy || !emailInput.trim() ? 0.5 : 1 }]}
              disabled={busy || !emailInput.trim()}
              onPress={onSendCode}
              accessibilityRole="button"
            >
              {busy ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={[styles.buttonText, { color: colors.onPrimary }]}>Code senden</Text>}
            </Pressable>
            <Pressable style={styles.linkButton} disabled={busy} onPress={onCancelEdit} accessibilityRole="button">
              <Text style={[styles.linkText, { color: colors.textSecondary }]}>Abbrechen</Text>
            </Pressable>
          </View>
        </>
      )}

      {mode === 'enterCode' && state.pending && (
        <>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            Gib den 6-stelligen Code aus der E-Mail an {state.pending.email} ein. Er gilt 10 Minuten.
          </Text>
          <TextInput
            style={[inputStyle, styles.codeInput]}
            value={codeInput}
            onChangeText={(t) => setCodeInput(t.replace(/[^0-9]/g, '').slice(0, 6))}
            placeholder="123456"
            placeholderTextColor={colors.textTertiary}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={6}
            editable={!busy}
          />
          <View style={styles.row}>
            <Pressable
              style={[styles.button, { backgroundColor: colors.primary, opacity: busy || codeInput.length !== 6 ? 0.5 : 1 }]}
              disabled={busy || codeInput.length !== 6}
              onPress={onConfirm}
              accessibilityRole="button"
            >
              {busy ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={[styles.buttonText, { color: colors.onPrimary }]}>Bestätigen</Text>}
            </Pressable>
            <Pressable style={styles.linkButton} disabled={busy} onPress={onCancelEdit} accessibilityRole="button">
              <Text style={[styles.linkText, { color: colors.textSecondary }]}>Abbrechen</Text>
            </Pressable>
          </View>
        </>
      )}

      {error ? <Text style={[styles.feedback, { color: colors.error }]}>{error}</Text> : null}
      {info && !error ? <Text style={[styles.feedback, { color: colors.success }]}>{info}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 16, gap: 10 },
  title: { fontFamily: fontFamily.semiBold, fontSize: 15 },
  body: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 21 },
  value: { fontFamily: fontFamily.medium, fontSize: 15 },
  hint: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 2 },
  button: { borderRadius: 999, paddingVertical: 12, paddingHorizontal: 18, alignItems: 'center', minWidth: 120 },
  buttonText: { fontFamily: fontFamily.semiBold, fontSize: 14 },
  linkButton: { paddingVertical: 12, paddingHorizontal: 6 },
  linkText: { fontFamily: fontFamily.medium, fontSize: 14 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontFamily: fontFamily.regular, fontSize: 15 },
  codeInput: { fontFamily: fontFamily.mono, fontSize: 20, letterSpacing: 6 },
  feedback: { fontFamily: fontFamily.medium, fontSize: 13, lineHeight: 19 },
});
