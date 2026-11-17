/**
 * "Mit 12 Wörtern anmelden" (expert path, gated by the 'words' surface): the typed words open the
 * account they own (words-account.ts `signInWithWords`). When words are stored on this device,
 * "Gespeichertes Konto auf diesem Gerät öffnen" opens that account with one device unlock instead.
 *
 * A dismissed unlock prompt keeps the typed words (WordsInput stays mounted with its text). When
 * the device holds the unconfirmed words of another account (E4), the person may — on an explicit
 * tap only — let the app drop them if they are no longer readable (`discardIfUnreadable`).
 */
import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useSetActiveWallet } from 'thirdweb/react';

import { useTheme } from '@/context/ThemeContext';
import { BigButton, Card, Notice, ScreenHeader, passkeyStyles, usePasskeyGate } from '@/components/passkey/PasskeyUi';
import WordsInput from '@/components/passkey/WordsInput';
import type { WordsResult } from '@/lib/passkey/words-account';

type Busy = 'typed' | 'stored' | 'discard' | null;
type NoticeState = { tone: 'error' | 'info' | 'success'; text: string } | null;

const SEARCHING_TEXT = 'Konto wird gesucht …';

export default function WordsSignInScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const setActiveWallet = useSetActiveWallet();
  const allowed = usePasskeyGate('words');

  const [hasStored, setHasStored] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [recoveryRoute, setRecoveryRoute] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    import('@/lib/passkey/phrase-store-runtime')
      .then(({ phraseStore }) => phraseStore.has())
      .catch(() => false)
      .then((has) => {
        if (!cancelled) setHasStored(has);
      });
    return () => {
      cancelled = true;
    };
  }, [allowed]);

  const handle = async (r: WordsResult) => {
    if (r.status === 'signedIn') {
      const rt = await import('@/lib/passkey/signin-runtime');
      // Leave first: the welcome screen below would otherwise also react to the new login.
      // The session is stored already: a failed activation is restored on the next start (and said so).
      if (router.canDismiss()) router.dismissAll();
      router.replace('/' as any);
      await rt
        .activatePasskeySession(r.session, setActiveWallet)
        .catch(() => Alert.alert('Anmeldung nicht abgeschlossen', 'Dein Konto ist gespeichert. Starte die App neu, dann bist du angemeldet.'));
      return;
    }
    if (r.status === 'cancelled') return; // the typed words stay in the field
    if (r.status === 'recoveryWords') {
      setNotice({ tone: 'info', text: r.message });
      setRecoveryRoute(r.route);
      return;
    }
    setNotice({ tone: 'error', text: r.message });
    setOverwrite(r.reason === 'overwrite');
  };

  const run = async (kind: 'typed' | 'stored', phrase?: string) => {
    if (busy) return;
    setBusy(kind);
    setNotice(null);
    setOverwrite(false);
    setRecoveryRoute(null);
    try {
      const [account, { createWordsAccountDeps }] = await Promise.all([
        import('@/lib/passkey/words-account'),
        import('@/lib/passkey/words-account-runtime'),
      ]);
      const deps = createWordsAccountDeps();
      const r = kind === 'typed' && phrase ? await account.signInWithWords(phrase, deps) : await account.openStoredWordsAccount(deps);
      await handle(r);
    } catch {
      setNotice({ tone: 'error', text: 'Das hat nicht geklappt. Bitte versuche es erneut.' });
    } finally {
      setBusy(null);
    }
  };

  // E4 escape, on an explicit tap only: costs one unlock prompt if the stored words are readable.
  const discard = async () => {
    if (busy) return;
    setBusy('discard');
    try {
      const { phraseStore } = await import('@/lib/passkey/phrase-store-runtime');
      const removed = await phraseStore.discardIfUnreadable();
      if (removed) {
        setOverwrite(false);
        setHasStored(false);
        setNotice({ tone: 'success', text: 'Die nicht mehr lesbaren Wörter sind entfernt. Tippe noch einmal auf „Weiter".' });
      } else {
        setNotice({
          tone: 'info',
          text: 'Die gespeicherten Wörter sind lesbar und bleiben auf diesem Gerät. Öffne zuerst das gespeicherte Konto und bestätige die Wörter.',
        });
      }
    } catch {
      // A dismissed prompt changes nothing.
    } finally {
      setBusy(null);
    }
  };

  if (!allowed) {
    return <SafeAreaView style={[passkeyStyles.container, { backgroundColor: colors.background }]} />;
  }

  return (
    <SafeAreaView style={[passkeyStyles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title="Mit 12 Wörtern anmelden" />
      <ScrollView contentContainerStyle={passkeyStyles.content} keyboardShouldPersistTaps="handled">
        {hasStored ? (
          <BigButton
            label="Gespeichertes Konto auf diesem Gerät öffnen"
            busy={busy === 'stored'}
            disabled={!!busy && busy !== 'stored'}
            onPress={() => void run('stored')}
          />
        ) : null}
        <Text style={[passkeyStyles.body, { color: colors.textSecondary }]}>Gib deine 12 Wörter ein, in der richtigen Reihenfolge.</Text>
        <WordsInput busy={busy === 'typed'} onValid={(phrase) => void run('typed', phrase)} />
        {busy === 'typed' || busy === 'stored' ? <Notice tone="info" text={SEARCHING_TEXT} /> : null}
        {notice ? <Notice tone={notice.tone} text={notice.text} /> : null}
        {recoveryRoute ? (
          <BigButton label="Konto wiederherstellen" onPress={() => router.replace(recoveryRoute as any)} />
        ) : null}
        {overwrite ? (
          <Card>
            <Text style={[passkeyStyles.bodySmall, { color: colors.textSecondary }]}>
              Wenn sich Fingerabdruck oder Gesicht geändert haben, kann dein Handy diese Wörter nicht mehr lesen. Dann kannst du sie entfernen.
            </Text>
            <BigButton label="Nicht mehr lesbare Wörter entfernen" kind="secondary" busy={busy === 'discard'} onPress={discard} />
          </Card>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
