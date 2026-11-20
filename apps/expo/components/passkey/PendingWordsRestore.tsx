/**
 * Settings: a words recovery whose keys did not come back yet (skipped or failed on the restore
 * screen). Shown until the restore succeeds; the pending marker lives in words-recovery.ts.
 */
import React, { useCallback, useState } from 'react';
import { Text } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { Address } from 'viem';
import { useTheme } from '@/context/ThemeContext';
import { WORDS_RESTORE_NO_VAULT_KEY_MESSAGE, WORDS_VAULT_KEY_MISSING, wordsKeyRestoreMessage } from '@/lib/passkey/words-recovery';
import { BigButton, Card, Notice, friendlyError, passkeyStyles } from './PasskeyUi';

export default function PendingWordsRestore({ safe }: { safe: Address }) {
  const { colors } = useTheme();
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      import('@/lib/passkey/derived-keys-runtime')
        .then((rt) => rt.hasPendingWordsRestore(safe))
        .catch(() => false)
        .then((p) => !cancelled && setPending(p));
      return () => {
        cancelled = true;
      };
    }, [safe]),
  );

  const run = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const rt = await import('@/lib/passkey/derived-keys-runtime');
      const r = await rt.restorePendingWordsKeys(safe);
      setMessage(wordsKeyRestoreMessage(r) ?? 'Deine Schlüssel sind wieder da.');
      setPending(await rt.hasPendingWordsRestore(safe).catch(() => false));
    } catch (e) {
      const missing = (e as { name?: string } | null)?.name === WORDS_VAULT_KEY_MISSING;
      setMessage(missing ? WORDS_RESTORE_NO_VAULT_KEY_MESSAGE : friendlyError(e, 'Deine Schlüssel konnten nicht geladen werden. Bitte versuche es erneut.'));
      if (missing) setPending(false);
    } finally {
      setBusy(false);
    }
  };

  if (!pending) return message ? <Notice tone="info" text={message} /> : null;
  return (
    <Card>
      <Text style={[passkeyStyles.label, { color: colors.textPrimary }]}>Schlüssel wiederherstellen</Text>
      <Text style={[passkeyStyles.bodySmall, { color: colors.textSecondary }]}>
        Deine Schlüssel für Abstimmungen und Nachrichten sind noch nicht zurück. Sie sind mit deinen Wörtern gesichert. Bestätige
        zweimal mit deinem Fingerabdruck.
      </Text>
      {message ? <Notice tone="warning" text={message} /> : null}
      <BigButton label="Schlüssel wiederherstellen" busy={busy} onPress={run} />
    </Card>
  );
}
