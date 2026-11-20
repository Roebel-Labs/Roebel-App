/**
 * Expert path: create an independent account whose key is 12 words (gated by the 'words' surface).
 *
 * intro → creating (the words are generated and stored behind the device unlock; record and
 * session are written — the account exists from here on) → show (the words, once) → confirm
 * (three of them; "Später" skips) → the session is activated and the person lands at home.
 *
 * The session is activated only after the show step was acknowledged. If the app is left or
 * killed during show / confirm, nothing is lost: the next start restores the stored session and
 * Settings → "Meine 12 Wörter" shows the words again after the device unlock (Review Focus 5).
 *
 * The words live only in this screen's state: gone on unmount and as soon as the app goes to the
 * background (the screen then says where to find them); while 'inactive' (iOS app switcher
 * snapshot) a blank cover hides them. No copy button, no clipboard.
 *
 * Once the account exists (creating / show / confirm / away) EVERY way out — the header back, the
 * iOS swipe-back and the Android hardware back — goes through `finish()` (usePreventRemove): a
 * plain pop would leave a stored words session behind a logged-out welcome screen.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useSetActiveWallet } from 'thirdweb/react';

import { useTheme } from '@/context/ThemeContext';
import { BigButton, Notice, ScreenHeader, passkeyStyles, usePasskeyGate } from '@/components/passkey/PasskeyUi';
import WordsConfirm from '@/components/passkey/WordsConfirm';
import WordsGrid from '@/components/passkey/WordsGrid';
import { deferWelcomeWizard } from '@/lib/onboarding-deferral';
import type { PasskeySession } from '@/lib/passkey/session';
import { pickConfirmPositions } from '@/lib/passkey/words';

type Step = 'intro' | 'creating' | 'show' | 'confirm' | 'away' | 'finishing';

const INTRO_TEXT =
  'Dein Schlüssel sind 12 Wörter, die nur auf diesem Handy liegen. Kein Apple- oder Google-Schlüsselbund. Wer die Wörter hat, hat das Konto: Bewahre sie gut auf.';
const SHOW_TEXT = 'Schreib die Wörter auf Papier, in dieser Reihenfolge.';
const AWAY_TEXT =
  'Dein Konto ist erstellt und deine 12 Wörter liegen sicher auf diesem Handy. Du findest sie jederzeit unter Einstellungen → Konto & Wiederherstellung → Meine 12 Wörter.';
/** Shown when the session could not be switched on after leaving (it is stored: a restart opens it). */
const ACTIVATE_FAILED_TITLE = 'Anmeldung nicht abgeschlossen';
const ACTIVATE_FAILED_TEXT = 'Dein Konto ist gespeichert. Starte die App neu, dann bist du angemeldet.';
const SAVE_FAILED_HINT = 'Schreib die Wörter trotzdem auf. Danach öffnest du dein Konto über „Gespeichertes Konto auf diesem Gerät öffnen".';

export default function WordsSignUpScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const setActiveWallet = useSetActiveWallet();
  const allowed = usePasskeyGate('words');

  const [step, setStep] = useState<Step>('intro');
  const [notice, setNotice] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  // The phrase is screen state only; `held` lets the AppState listener see it without re-subscribing.
  const [phrase, setPhrase] = useState<string | null>(null);
  const held = useRef(false);
  // null after a create whose account could not be saved: the words are shown, the account is opened later.
  const [session, setSession] = useState<PasskeySession | null>(null);
  const [positions, setPositions] = useState<[number, number, number]>([0, 1, 2]);
  const [confirmBusy, setConfirmBusy] = useState(false);
  // Set by finish(): the navigation runs in an effect AFTER the render that lifted the guard.
  const [leaving, setLeaving] = useState<{ session: PasskeySession | null } | null>(null);
  // iOS-only in effect: iOS reports 'inactive' while it takes the app-switcher snapshot; Android
  // goes straight to 'background' (where the words are dropped anyway). The cover hides them.
  const [covered, setCovered] = useState(false);

  const forget = useCallback(() => {
    held.current = false;
    setPhrase(null);
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      setCovered(state === 'inactive');
      if (state !== 'background' || !held.current) return;
      // The account and the stored words stay; only this screen's copy is dropped.
      forget();
      setStep((s) => (s === 'show' || s === 'confirm' ? 'away' : s));
    });
    return () => {
      sub.remove();
      held.current = false;
    };
  }, [forget]);

  const create = async () => {
    if (step === 'creating') return;
    setStep('creating');
    setNotice(null);
    try {
      const [{ createWordsAccount }, { createWordsAccountDeps }] = await Promise.all([
        import('@/lib/passkey/words-account'),
        import('@/lib/passkey/words-account-runtime'),
      ]);
      const r = await createWordsAccount(createWordsAccountDeps());
      if (r.status === 'signedIn' && r.phrase) {
        setSession(r.session);
        setPhrase(r.phrase);
        held.current = true;
        setPositions(pickConfirmPositions());
        setStep('show');
        return;
      }
      if (r.status === 'error' && r.phrase) {
        // The words are stored but the account could not be saved: show them anyway.
        setSession(null);
        setPhrase(r.phrase);
        held.current = true;
        setPositions(pickConfirmPositions());
        setNotice({ tone: 'error', text: `${r.message} ${SAVE_FAILED_HINT}` });
        setStep('show');
        return;
      }
      if (r.status === 'error') setNotice({ tone: 'error', text: r.message });
      setStep('intro');
    } catch {
      setNotice({ tone: 'error', text: 'Das hat nicht geklappt. Bitte versuche es erneut.' });
      setStep('intro');
    }
  };

  const finish = () => {
    if (leaving) return;
    forget();
    if (session) deferWelcomeWizard(session.identity);
    setStep('finishing');
    setLeaving({ session });
  };

  // The account exists from 'creating' on: no way out but finish(). While creating, the person
  // waits for the result (the store may be writing).
  const guarded = step === 'creating' || step === 'show' || step === 'confirm' || step === 'away';
  usePreventRemove(guarded, () => {
    if (step !== 'creating') finish();
  });

  useEffect(() => {
    if (!leaving) return;
    const s = leaving.session;
    if (!s) {
      router.replace('/passkey/words-signin' as any);
      return;
    }
    // Leave first: the welcome screen below would otherwise also react to the new login.
    if (router.canDismiss()) router.dismissAll();
    router.replace('/' as any);
    import('@/lib/passkey/signin-runtime')
      .then((rt) => rt.activatePasskeySession(s, setActiveWallet))
      .catch(() => Alert.alert(ACTIVATE_FAILED_TITLE, ACTIVATE_FAILED_TEXT));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving]);

  const confirmed = async () => {
    if (confirmBusy || leaving) return;
    setConfirmBusy(true);
    try {
      const { phraseStore } = await import('@/lib/passkey/phrase-store-runtime');
      await phraseStore.markConfirmed();
    } catch {
      // Not fatal: Settings offers "Wörter bestätigen" again.
    } finally {
      setConfirmBusy(false);
    }
    finish();
  };

  if (!allowed) {
    return <SafeAreaView style={[passkeyStyles.container, { backgroundColor: colors.background }]} />;
  }

  const body = (t: string) => <Text style={[passkeyStyles.body, { color: colors.textSecondary }]}>{t}</Text>;
  const holding = step === 'show' || step === 'confirm';

  return (
    <SafeAreaView style={[passkeyStyles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title="Konto mit 12 Wörtern" onBack={holding || step === 'away' ? finish : undefined} />
      <ScrollView contentContainerStyle={passkeyStyles.content} keyboardShouldPersistTaps="handled">
        {step === 'intro' || step === 'creating' ? (
          <>
            <Text style={[passkeyStyles.lede, { color: colors.textPrimary }]}>Unabhängiges Konto mit 12 Wörtern</Text>
            {body(INTRO_TEXT)}
            <BigButton label="Konto erstellen" busy={step === 'creating'} onPress={create} />
          </>
        ) : step === 'show' ? (
          <>
            {body(SHOW_TEXT)}
            <WordsGrid words={(phrase ?? '').split(' ')} />
            <BigButton label="Ich habe sie aufgeschrieben" onPress={() => setStep('confirm')} />
          </>
        ) : step === 'confirm' ? (
          <>
            <WordsConfirm phrase={phrase ?? ''} positions={positions} onConfirmed={confirmed} busy={confirmBusy} />
            <BigButton label="Wörter noch einmal ansehen" kind="secondary" onPress={() => setStep('show')} />
            <BigButton label="Später" kind="secondary" onPress={finish} />
          </>
        ) : step === 'away' ? (
          <>
            {body(AWAY_TEXT)}
            <BigButton label="Weiter" onPress={finish} />
          </>
        ) : (
          <View style={passkeyStyles.center}>
            <BigButton label="Weiter" busy onPress={() => undefined} />
          </View>
        )}
        {notice ? <Notice tone={notice.tone} text={notice.text} /> : null}
      </ScrollView>
      {covered && holding ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} pointerEvents="none" />
      ) : null}
    </SafeAreaView>
  );
}
