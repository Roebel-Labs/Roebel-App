/**
 * Settings → Konto & Wiederherstellung → "Meine 12 Wörter" (only for a 12-word session, gated by
 * the 'words' surface).
 *
 *   - "Meine 12 Wörter anzeigen": one device unlock, then the words. They live only in this
 *     screen's state: cleared when the app goes to the background and on unmount; while
 *     'inactive' (iOS app-switcher snapshot) a blank cover hides them.
 *   - "Wörter bestätigen" while unconfirmed: three of the words (one device unlock, or none if
 *     they are already on screen) → `markConfirmed`.
 *   - "Wörter von diesem Gerät löschen" only when confirmed: device unlock, the words are
 *     removed and the person is logged out (the words sign them in again).
 *   - Re-entry (`?reenter=1` from the root watcher on PhraseUnavailableError, a failed read here,
 *     or no stored words while the words session is active): the person types the words again;
 *     they must derive `session.owner`. Typing them proves possession, so they are marked
 *     confirmed again (the write reset the flag, preflight E3). A dismissed prompt keeps the text.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useActiveAccount, useActiveWallet, useDisconnect } from 'thirdweb/react';
import { isAddressEqual, type Address } from 'viem';

import { useTheme } from '@/context/ThemeContext';
import { BigButton, Card, Notice, ScreenHeader, passkeyStyles, usePasskeyGate } from '@/components/passkey/PasskeyUi';
import WordsConfirm from '@/components/passkey/WordsConfirm';
import WordsGrid from '@/components/passkey/WordsGrid';
import WordsInput from '@/components/passkey/WordsInput';
import { passkeySessionOf } from '@/lib/passkey/active';
import {
  PHRASE_PROMPT,
  PhraseCancelledError,
  PhraseOverwriteError,
  PhraseUnavailableError,
  NO_BIOMETRICS_MESSAGE,
} from '@/lib/passkey/phrase-store';
import { isWordsOwner, type PasskeySession } from '@/lib/passkey/session';
import { pickConfirmPositions, validatePhrase, wordsFromSeed } from '@/lib/passkey/words';

const REENTER_TEXT =
  'Dein Handy hat die gespeicherten Wörter gesperrt, weil sich Fingerabdruck oder Gesicht geändert haben. Gib deine 12 Wörter noch einmal ein.';
const WRONG_WORDS_TEXT = 'Diese Wörter gehören nicht zu diesem Konto.';
const DELETE_TEXT = 'Danach brauchst du die 12 Wörter, um dich wieder anzumelden.';
const FAILED_TEXT = 'Das hat nicht geklappt. Bitte versuche es erneut.';

type View_ = 'loading' | 'main' | 'show' | 'confirm' | 'reenter';
type NoticeState = { tone: 'error' | 'info' | 'success'; text: string } | null;
type Busy = 'show' | 'confirm' | 'reenter' | 'delete' | 'discard' | null;

const isCancel = (e: unknown) => e instanceof PhraseCancelledError || /cancel/i.test(e instanceof Error ? e.message : String(e));
const loadStore = () => import('@/lib/passkey/phrase-store-runtime').then((m) => m.phraseStore);
const ownerOf = (phrase: string): Address => wordsFromSeed(phrase).account(0).address;

export default function MyWordsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const account = useActiveAccount();
  const wallet = useActiveWallet();
  const { disconnect } = useDisconnect();
  const allowed = usePasskeyGate('words');
  const params = useLocalSearchParams<{ reenter?: string }>();
  const session = passkeySessionOf<PasskeySession>(account);
  const words = isWordsOwner(session) && !!session?.owner;
  const owner = (session?.owner ?? null) as Address | null;

  const [view, setView] = useState<View_>('loading');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [askDelete, setAskDelete] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const [positions, setPositions] = useState<[number, number, number]>([0, 1, 2]);
  // The phrase is screen state only; `held` lets the AppState listener see it without re-subscribing.
  const [phrase, setPhrase] = useState<string | null>(null);
  const held = useRef(false);
  const [covered, setCovered] = useState(false);

  const forget = useCallback(() => {
    held.current = false;
    setPhrase(null);
  }, []);

  useEffect(() => {
    if (!allowed || !words) return;
    let cancelled = false;
    (async () => {
      try {
        const store = await loadStore();
        const [has, ok] = await Promise.all([store.has(), store.isConfirmed()]);
        if (cancelled) return;
        setConfirmed(ok);
        // No stored words while this words session is active = re-entry, never "no account".
        setView(params.reenter === '1' || !has ? 'reenter' : 'main');
      } catch {
        if (!cancelled) {
          setNotice({ tone: 'error', text: FAILED_TEXT });
          setView('main');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allowed, words, params.reenter]);

  // The words never outlive the screen, and never sit in memory while the app is in the background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      setCovered(state === 'inactive');
      // 'background' only: the unlock prompt makes iOS report 'inactive' while we read.
      if (state !== 'background' || !held.current) return;
      forget();
      setView((v) => (v === 'show' || v === 'confirm' ? 'main' : v));
    });
    return () => {
      sub.remove();
      held.current = false;
    };
  }, [forget]);

  /** One device unlock → the stored words (checked against this account), or null with a notice. */
  const readWords = async (): Promise<string | null> => {
    if (phrase) return phrase;
    const store = await loadStore();
    try {
      const p = await store.read(PHRASE_PROMPT);
      const check = validatePhrase(p);
      if (!check.ok || !owner || !isAddressEqual(ownerOf(check.phrase), owner)) {
        setNotice({ tone: 'error', text: WRONG_WORDS_TEXT });
        return null;
      }
      held.current = true;
      setPhrase(check.phrase);
      return check.phrase;
    } catch (e) {
      if (e instanceof PhraseUnavailableError) {
        setView('reenter');
        return null;
      }
      if (!isCancel(e)) setNotice({ tone: 'error', text: FAILED_TEXT });
      return null;
    }
  };

  const show = async () => {
    if (busy) return;
    setBusy('show');
    setNotice(null);
    try {
      if (await readWords()) setView('show');
    } finally {
      setBusy(null);
    }
  };

  const startConfirm = async () => {
    if (busy) return;
    setBusy('confirm');
    setNotice(null);
    try {
      if (await readWords()) {
        setPositions(pickConfirmPositions());
        setView('confirm');
      }
    } finally {
      setBusy(null);
    }
  };

  const onConfirmed = async () => {
    try {
      const store = await loadStore();
      await store.markConfirmed();
      setConfirmed(true);
      forget();
      setView('main');
      setNotice({ tone: 'success', text: 'Bestätigt. Deine Wörter sind dein Weg zurück.' });
    } catch {
      setNotice({ tone: 'error', text: FAILED_TEXT });
    }
  };

  const reenter = async (typed: string) => {
    if (busy || !owner) return;
    setBusy('reenter');
    setNotice(null);
    setOverwrite(false);
    try {
      if (!isAddressEqual(ownerOf(typed), owner)) {
        setNotice({ tone: 'error', text: WRONG_WORDS_TEXT });
        return;
      }
      const store = await loadStore();
      try {
        await store.write(typed);
      } catch (e) {
        if (e instanceof PhraseOverwriteError) {
          setNotice({ tone: 'error', text: e.message });
          setOverwrite(true);
        } else if (e instanceof Error && e.message === NO_BIOMETRICS_MESSAGE) {
          setNotice({ tone: 'error', text: NO_BIOMETRICS_MESSAGE });
        } else if (!isCancel(e)) {
          setNotice({ tone: 'error', text: FAILED_TEXT });
        }
        // A dismissed prompt: the typed words stay in the field.
        return;
      }
      // The person typed exactly these words: they hold them (E3: `write` reset the flag).
      await store.markConfirmed().catch(() => undefined);
      setConfirmed(await store.isConfirmed().catch(() => false));
      setView('main');
      setNotice({ tone: 'success', text: 'Deine Wörter sind wieder auf diesem Gerät gespeichert.' });
      if (params.reenter) router.setParams({ reenter: undefined });
    } catch {
      setNotice({ tone: 'error', text: FAILED_TEXT });
    } finally {
      setBusy(null);
    }
  };

  // E4 escape, on an explicit tap only: costs one unlock prompt if the stored words are readable.
  const discard = async () => {
    if (busy) return;
    setBusy('discard');
    try {
      const store = await loadStore();
      const removed = await store.discardIfUnreadable();
      setOverwrite(false);
      setNotice(
        removed
          ? { tone: 'success', text: 'Die nicht mehr lesbaren Wörter sind entfernt. Tippe noch einmal auf „Weiter".' }
          : { tone: 'info', text: 'Die gespeicherten Wörter sind lesbar und bleiben auf diesem Gerät.' },
      );
    } catch {
      // A dismissed prompt changes nothing.
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (busy) return;
    setBusy('delete');
    setNotice(null);
    try {
      const store = await loadStore();
      // The device unlock first (an unreadable item may go without it: it can never sign again).
      try {
        await store.read(PHRASE_PROMPT);
      } catch (e) {
        if (!(e instanceof PhraseUnavailableError)) {
          if (!isCancel(e)) setNotice({ tone: 'error', text: FAILED_TEXT });
          return;
        }
      }
      await store.remove();
      forget();
      if (wallet) disconnect(wallet);
      router.replace('/' as any);
    } catch {
      setNotice({ tone: 'error', text: FAILED_TEXT });
    } finally {
      setBusy(null);
    }
  };

  if (!allowed || (words && view === 'loading')) {
    return (
      <SafeAreaView style={[passkeyStyles.container, { backgroundColor: colors.background }]}>
        <View style={passkeyStyles.center}>{allowed === false ? null : <ActivityIndicator color={colors.primary} />}</View>
      </SafeAreaView>
    );
  }

  const body = (t: string) => <Text style={[passkeyStyles.body, { color: colors.textSecondary }]}>{t}</Text>;
  const holding = view === 'show' || view === 'confirm';

  return (
    <SafeAreaView style={[passkeyStyles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title="Meine 12 Wörter" />
      <ScrollView contentContainerStyle={passkeyStyles.content} keyboardShouldPersistTaps="handled">
        {!words ? (
          <Notice tone="info" text="Diese Seite gibt es nur für ein Konto mit 12 Wörtern." />
        ) : view === 'reenter' ? (
          <>
            {body(REENTER_TEXT)}
            <WordsInput busy={busy === 'reenter'} onValid={(p) => void reenter(p)} />
            {overwrite ? (
              <BigButton label="Nicht mehr lesbare Wörter entfernen" kind="secondary" busy={busy === 'discard'} onPress={discard} />
            ) : null}
          </>
        ) : view === 'show' ? (
          <>
            {body('Schreib die Wörter auf Papier, in dieser Reihenfolge.')}
            <WordsGrid words={(phrase ?? '').split(' ')} />
            {confirmed ? null : <BigButton label="Wörter bestätigen" onPress={() => void startConfirm()} />}
            <BigButton
              label="Fertig"
              kind="secondary"
              onPress={() => {
                forget();
                setView('main');
              }}
            />
          </>
        ) : view === 'confirm' ? (
          <>
            <WordsConfirm phrase={phrase ?? ''} positions={positions} onConfirmed={() => void onConfirmed()} />
            <BigButton label="Wörter noch einmal ansehen" kind="secondary" onPress={() => setView('show')} />
          </>
        ) : (
          <>
            <Text style={[passkeyStyles.lede, { color: colors.textPrimary }]}>Deine 12 Wörter</Text>
            {body('Sie sind der Schlüssel zu deinem Konto und liegen nur auf diesem Handy. Zum Anzeigen brauchst du deine Gerätesperre.')}
            <BigButton label="Meine 12 Wörter anzeigen" busy={busy === 'show'} onPress={() => void show()} />
            {confirmed ? null : (
              <BigButton label="Wörter bestätigen" kind="secondary" busy={busy === 'confirm'} onPress={() => void startConfirm()} />
            )}
            {confirmed ? (
              askDelete ? (
                <Card>
                  {body(DELETE_TEXT)}
                  <View style={styles.row}>
                    <BigButton label="Ja, löschen" kind="danger" busy={busy === 'delete'} onPress={() => void remove()} style={styles.flex} />
                    <BigButton label="Nein" kind="secondary" onPress={() => setAskDelete(false)} style={styles.flex} />
                  </View>
                </Card>
              ) : (
                <BigButton label="Wörter von diesem Gerät löschen" kind="secondary" onPress={() => setAskDelete(true)} />
              )
            ) : null}
          </>
        )}
        {notice ? <Notice tone={notice.tone} text={notice.text} /> : null}
      </ScrollView>
      {covered && holding ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} pointerEvents="none" />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1 },
});
