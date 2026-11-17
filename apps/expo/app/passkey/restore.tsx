/**
 * "Konto wiederherstellen" on a new phone (reachable from the passkey screen and the login /
 * welcome surfaces while the preview gate is open).
 *   find the person by name → their passkey Safe (on-chain link, needs guardians) → new passkey →
 *   QR for the guardians → they confirm on-chain → start (3-day delay, fingerprint) → countdown →
 *   finish (fingerprint) → this phone operates the recovered Safe.
 * Or, when the 'words' surface is open, "Mit 12 Wörtern": the words find the account and sign as
 * guardians on this phone → the same 3-day delay (the owner is warned and can cancel) → finish →
 * the keys come back from their words copies.
 * An EXPERT account (its owner is a plain key: no contract code, or a 7702 designator — E9) is
 * recovered to NEW 12 words instead of a passkey (words surface open): the words are shown and
 * confirmed (no skip) before the guardians' code appears; keys wrapped under the old words do not
 * come back (said under the code); `done` opens the account with the new words.
 * All logic is in lib/passkey/recovery-flow.ts; the state is persisted, so leaving is safe.
 */
import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useActiveWallet, useSetActiveWallet } from 'thirdweb/react';
import { getAddress, type Address } from 'viem';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { BigButton, Card, Initials, Notice, ScreenHeader, friendlyError, passkeyStyles, usePasskeyGate } from '@/components/passkey/PasskeyUi';
import PasskeyQrCard from '@/components/passkey/PasskeyQrCard';
import HelperLogin from '@/components/passkey/HelperLogin';
import { HELPER_IDLE, helperBusy, helperReducer, planHelperConfirm } from '@/lib/passkey/recovery-helper';
import type { HelperLogin as HelperLoginChoice } from '@/lib/passkey/recovery-helper-runtime';
import { buildRecoverLink } from '@/lib/passkey/deeplinks';
import { isPasskeySurfaceAllowed } from '@/lib/passkey/gate';
import { profileName } from '@/lib/passkey/people';
import WordsInput from '@/components/passkey/WordsInput';
import WordsConfirm from '@/components/passkey/WordsConfirm';
import WordsGrid from '@/components/passkey/WordsGrid';
import { PHRASE_PROMPT } from '@/lib/passkey/phrase-store';
import { phraseStore } from '@/lib/passkey/phrase-store-runtime';
import { pickConfirmPositions, wordsFromSeed, type WordsKit } from '@/lib/passkey/words';
import {
  NO_WORDS_ACCOUNT_MESSAGE,
  WORDS_RESTORE_NO_VAULT_KEY_MESSAGE,
  WORDS_VAULT_KEY_MISSING,
  findWalletsByWords,
  wordsKeyRestoreMessage,
  type WordsWallet,
} from '@/lib/passkey/words-recovery';
import {
  abandonRecovery,
  clearRecoveryState,
  executeRecoveryStep,
  finalizeRecoveryStep,
  formatRemaining,
  loadRecoveryState,
  pollRecovery,
  recoveryWordsStatus,
  resumeRecovery,
  startRecovery,
  startWordsRecovery,
  type RecoveryState,
} from '@/lib/passkey/recovery-flow';
import { findRecoverableAccounts, type RecoveryCandidate } from '@/lib/passkey/recovery-lookup';
import {
  createRecoveryDeps,
  lookupChain,
  readRecoveryOwnerKind,
  recoveryStorage,
  resolvePeopleNow,
  searchPeopleByName,
  wordsLookupChain,
  type PersonSearchHit,
} from '@/lib/passkey/guardians-runtime';

const deps = createRecoveryDeps();

type OwnerKind = 'passkey' | 'ecdsa';
type Found = { name: string; candidates: RecoveryCandidate[]; kind: OwnerKind };

/** Open question 4 (plan 3): what a recovery to new words does not bring back. */
const OLD_KEYS_NOTE = 'Abstimmungs- und Nachrichtenschlüssel, die mit den alten Wörtern gesichert waren, kommen nicht zurück.';

export default function RestoreAccountScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const setActiveWallet = useSetActiveWallet();
  // An existing account, or a recovery already in progress, keeps this screen with sign-up closed.
  const allowed = usePasskeyGate('signup', true, 'account-or-recovery');
  const [state, setState] = useState<RecoveryState | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const stateRef = useRef<RecoveryState | null | undefined>(undefined);
  stateRef.current = state;
  // Which way back the person picked (before anything is persisted); null = not chosen yet.
  const [method, setMethod] = useState<'guardians' | 'words' | null>(null);
  const [wordsAllowed, setWordsAllowed] = useState(false);
  // Expert recovery: the new words, held only here and only right after `startRecovery`.
  const [newPhrase, setNewPhrase] = useState<string | null>(null);
  const [wordsStatus, setWordsStatus] = useState<'confirmed' | 'unconfirmed' | 'missing' | null>(null);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    isPasskeySurfaceAllowed('words')
      .catch(() => false)
      .then((ok) => !cancelled && setWordsAllowed(ok));
    return () => {
      cancelled = true;
    };
  }, [allowed]);

  useEffect(() => {
    if (!allowed) return;
    loadRecoveryState(recoveryStorage)
      .catch(() => null)
      .then((s) => setState(s));
  }, [allowed]);

  // Poll: every 5 s while waiting for guardians, every 60 s during the delay, and on resume.
  const tick = useCallback(async () => {
    const s = stateRef.current;
    if (!s || !['waitingForGuardians', 'waitingDelay', 'finalizing'].includes(s.step)) return;
    const next = await pollRecovery(s, deps);
    if (stateRef.current === s) setState(next);
  }, []);

  const step = state?.step;
  useEffect(() => {
    if (step !== 'waitingForGuardians' && step !== 'waitingDelay' && step !== 'finalizing') return;
    tick().catch(() => undefined);
    const every = step === 'waitingForGuardians' ? 5_000 : 60_000;
    const id = setInterval(() => {
      setNow(Math.floor(Date.now() / 1000));
      tick().catch(() => undefined);
    }, every);
    const sub = AppState.addEventListener('change', (a) => {
      if (a === 'active') tick().catch(() => undefined);
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [step, tick]);

  const act = useCallback(async (fn: (s: RecoveryState) => Promise<RecoveryState>) => {
    const s = stateRef.current;
    if (!s) return;
    setBusy(true);
    try {
      setState(await fn(s));
    } finally {
      setBusy(false);
    }
  }, []);

  const startOver = useCallback(async () => {
    await abandonRecovery(stateRef.current ?? null, deps).catch(() => undefined);
    setState(null);
    setMethod(null);
    setNewPhrase(null);
    setWordsStatus(null);
  }, []);

  // Expert recovery: are the new words on this phone confirmed (else show them first)?
  const expertWaiting = state?.ownerKind === 'ecdsa' && state.step === 'waitingForGuardians';
  const expertSigner = expertWaiting ? state?.signer : undefined;
  useEffect(() => {
    if (!expertWaiting || !stateRef.current) return;
    let cancelled = false;
    recoveryWordsStatus(stateRef.current, phraseStore)
      .catch(() => 'missing' as const)
      .then((st) => !cancelled && setWordsStatus(st));
    return () => {
      cancelled = true;
    };
  }, [expertWaiting, expertSigner]);

  const openRecovered = useCallback(async () => {
    await clearRecoveryState(recoveryStorage).catch(() => undefined);
    const rt = await import('@/lib/passkey/signin-runtime');
    const session = await rt.loadStoredPasskeySession().catch(() => null);
    if (router.canDismiss()) router.dismissAll();
    router.replace('/' as any);
    if (!session) return;
    await rt
      .activatePasskeySession(session, setActiveWallet)
      .catch(() => Alert.alert('Anmeldung nicht abgeschlossen', 'Dein Konto ist gespeichert. Starte die App neu, dann bist du angemeldet.'));
  }, [router, setActiveWallet]);

  const startWords = useCallback(async (w: WordsWallet, name: string, phrase: string, kit: WordsKit) => {
    setBusy(true);
    try {
      setState(await startWordsRecovery({ wallet: w.wallet, name, phrase, kit, recoveryLegacy: w.recoveryLegacy }, deps));
    } finally {
      setBusy(false);
    }
  }, []);

  const picking = !state || state.step === 'idle' || state.step === 'creatingPasskey';
  const chosen: 'guardians' | 'words' | null = state?.method === 'words' ? 'words' : wordsAllowed ? method : 'guardians';

  if (!allowed || state === undefined) {
    return (
      <SafeAreaView style={[passkeyStyles.container, { backgroundColor: colors.background }]}>
        <View style={passkeyStyles.center}>{allowed === false ? null : <ActivityIndicator color={colors.primary} />}</View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[passkeyStyles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title="Konto wiederherstellen" />
      <ScrollView contentContainerStyle={passkeyStyles.content} keyboardShouldPersistTaps="handled">
        {picking && chosen === null ? (
          <ChooseMethod onChoose={setMethod} />
        ) : picking && chosen === 'words' ? (
          <WordsRestore
            notice={state?.message ?? null}
            busy={busy}
            onStart={startWords}
            onBack={state?.method === 'words' ? startOver : () => setMethod(null)}
          />
        ) : picking ? (
          <FindAccount
            notice={state?.message ?? null}
            wordsAllowed={wordsAllowed}
            onChosen={async (name, c, ownerKind) => {
              setBusy(true);
              try {
                const r = await startRecovery({ wallet: c.wallet, name, recoveryLegacy: c.recoveryLegacy, ownerKind }, deps);
                setNewPhrase(r.phrase ?? null);
                setWordsStatus(r.phrase ? 'unconfirmed' : null);
                setState(r.state);
              } finally {
                setBusy(false);
              }
            }}
            busy={busy}
          />
        ) : expertWaiting && wordsStatus !== 'confirmed' ? (
          wordsStatus === null ? (
            <ActivityIndicator color={colors.primary} />
          ) : wordsStatus === 'missing' ? (
            <>
              <Notice
                tone="warning"
                text="Die neuen Wörter für diese Wiederherstellung sind nicht mehr auf diesem Handy. Beginne bitte neu."
              />
              <BigButton label="Neu beginnen" onPress={startOver} />
            </>
          ) : (
            <NewWords
              phrase={newPhrase}
              onDrop={() => setNewPhrase(null)}
              onConfirmed={() => {
                setNewPhrase(null);
                setWordsStatus('confirmed');
              }}
              onStartOver={startOver}
            />
          )
        ) : state.step === 'waitingForGuardians' && state.signer ? (
          <>
            <Text style={[passkeyStyles.lede, { color: colors.textPrimary }]}>Zeig diesen Code deinen Vertrauenspersonen</Text>
            <Text style={[passkeyStyles.body, { color: colors.textSecondary }]}>
              Sie scannen ihn mit ihrer Handykamera und bestätigen mit ihrem Fingerabdruck. Am besten persönlich oder am Telefon.
            </Text>
            <PasskeyQrCard
              value={buildRecoverLink({ wallet: state.wallet, signer: state.signer, name: state.name, legacy: state.recoveryLegacy })}
              name={state.name}
              caption={
                state.threshold
                  ? `${state.approvals ?? 0} von ${state.threshold} haben bestätigt`
                  : 'Wir warten auf die Bestätigungen …'
              }
              shareMessage={`${state.name} möchte das Konto wiederherstellen. Bitte nur bestätigen, wenn du sicher bist, dass es wirklich ${state.name} ist:`}
            />
            {state.ownerKind === 'ecdsa' ? <Notice tone="info" text={OLD_KEYS_NOTE} /> : null}
            {state.message ? <Notice tone="warning" text={state.message} /> : null}
            <HelperConfirm wallet={state.wallet} signer={state.signer} onConfirmed={() => tick().catch(() => undefined)} />
            <Pressable onPress={startOver} accessibilityRole="button" style={styles.textButton}>
              <Text style={[styles.textButtonLabel, { color: colors.textSecondary }]}>Abbrechen und neu beginnen</Text>
            </Pressable>
          </>
        ) : state.step === 'executing' ? (
          <>
            <Text style={[passkeyStyles.lede, { color: colors.textPrimary }]}>Genug Vertrauenspersonen haben bestätigt.</Text>
            <Text style={[passkeyStyles.body, { color: colors.textSecondary }]}>
              {state.ownerKind === 'ecdsa'
                ? 'Jetzt startest du die Wiederherstellung mit deiner Gerätesperre. Danach dauert es 3 Tage, bis dein Konto wieder da ist. So kann niemand heimlich dein Konto übernehmen.'
                : 'Jetzt startest du die Wiederherstellung mit deinem Fingerabdruck. Danach dauert es 3 Tage, bis dein Konto wieder da ist. So kann niemand heimlich dein Konto übernehmen.'}
            </Text>
            {state.message ? <Notice tone="warning" text={state.message} /> : null}
            <BigButton label="Wiederherstellung starten" busy={busy} onPress={() => act((s) => executeRecoveryStep(s, deps))} />
          </>
        ) : state.step === 'waitingDelay' ? (
          <>
            <Text style={[passkeyStyles.lede, { color: colors.textPrimary }]}>
              {state.executeAfter ? formatRemaining(state.executeAfter - now) : 'Noch etwa 3 Tage'}
            </Text>
            <Text style={[passkeyStyles.body, { color: colors.textSecondary }]}>
              Danach ist dein Konto wieder da. Du kannst die App solange schließen, wir merken uns alles.
            </Text>
            {state.method === 'words' ? (
              <Notice tone="info" text="Der Besitzer des Kontos wird jetzt gewarnt und kann das abbrechen." />
            ) : null}
            {state.message ? <Notice tone="warning" text={state.message} /> : null}
          </>
        ) : state.step === 'finalizing' ? (
          <>
            <Text style={[passkeyStyles.lede, { color: colors.textPrimary }]}>Es ist so weit.</Text>
            <Text style={[passkeyStyles.body, { color: colors.textSecondary }]}>
              {state.ownerKind === 'ecdsa' ? 'Hol dein Konto mit deiner Gerätesperre zurück.' : 'Hol dein Konto mit deinem Fingerabdruck zurück.'}
            </Text>
            {state.message ? <Notice tone="warning" text={state.message} /> : null}
            <BigButton label="Konto zurückholen" busy={busy} onPress={() => act((s) => finalizeRecoveryStep(s, deps))} />
          </>
        ) : state.step === 'done' ? (
          <>
            <Text style={[passkeyStyles.lede, { color: colors.textPrimary }]}>Dein Konto ist wieder da.</Text>
            <Text style={[passkeyStyles.body, { color: colors.textSecondary }]}>
              {state.ownerKind === 'ecdsa'
                ? 'Ab jetzt gehört es zu deinen neuen 12 Wörtern.'
                : 'Ab jetzt meldest du dich mit deinem Fingerabdruck an.'}
            </Text>
            {state.ownerKind === 'ecdsa' ? (
              <BigButton label="Weiter" onPress={openRecovered} />
            ) : state.method === 'words' ? (
              <WordsKeyRestore
                wallet={state.wallet}
                done={state}
                onContinue={async () => {
                  await clearRecoveryState(recoveryStorage).catch(() => undefined);
                  router.replace('/settings/passkey' as any);
                }}
              />
            ) : (
              <BigButton
                label="Weiter"
                onPress={async () => {
                  await clearRecoveryState(recoveryStorage).catch(() => undefined);
                  router.replace('/settings/passkey' as any);
                }}
              />
            )}
          </>
        ) : state.step === 'cancelled' ? (
          <>
            <Notice tone="warning" text={state.message ?? 'Die Wiederherstellung wurde abgebrochen.'} />
            <BigButton label="Neu beginnen" onPress={startOver} />
          </>
        ) : (
          <>
            <Notice tone="error" text={state.message ?? 'Etwas ist schiefgelaufen.'} />
            <BigButton label="Erneut versuchen" busy={busy} onPress={() => act((s) => resumeRecovery(s, deps))} />
            <Pressable onPress={startOver} accessibilityRole="button" style={styles.textButton}>
              <Text style={[styles.textButtonLabel, { color: colors.textSecondary }]}>Neu beginnen</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * "Mit E-Mail oder Google bestätigen": the recovery helper (a thirdweb account that is a guardian)
 * confirms on this phone. It logs in outside the connection manager, sends
 * SRM.confirmRecovery(wallet, [signer], 1, false) itself (gas: thirdweb sponsorship), and is logged
 * out again right away, so it never becomes this phone's session. The poll then moves on.
 */
function HelperConfirm({ wallet, signer, onConfirmed }: { wallet: Address; signer: Address; onConfirmed: () => void }) {
  const { colors } = useTheme();
  const activeWallet = useActiveWallet();
  const [open, setOpen] = useState(false);
  const [h, dispatch] = useReducer(helperReducer, HELPER_IDLE);

  // A thirdweb session in use on this phone would be replaced by the helper login.
  const thirdwebActive = !!activeWallet && activeWallet.id === 'inApp';

  const confirm = async (login: HelperLoginChoice) => {
    if (helperBusy(h)) return;
    dispatch({ type: 'start' });
    const rt = await import('@/lib/passkey/recovery-helper-runtime');
    let session: Awaited<ReturnType<typeof rt.signInHelper>>;
    try {
      session = await rt.signInHelper(login);
    } catch (e) {
      const msg = e instanceof Error && /Zeitüberschreitung/.test(e.message) ? e.message : undefined;
      dispatch(msg ? { type: 'error', message: msg } : { type: 'cancelled' });
      return;
    }
    dispatch({ type: 'signedIn' });
    try {
      const guardians = await rt.readGuardiansOf(wallet);
      const plan = planHelperConfirm({ wallet, signer, guardians, helper: session.account.address as Address });
      dispatch({ type: 'planned', plan });
      if (plan.kind !== 'confirm') return;
      await rt.sendHelperConfirm(session.account, plan.call);
      dispatch({ type: 'sent' });
      onConfirmed();
    } catch (e) {
      dispatch({ type: 'error', message: friendlyError(e) ?? undefined });
    } finally {
      await rt.endHelperSession(session);
    }
  };

  if (h.step === 'confirmed') return <Notice tone="success" text={h.message ?? 'Bestätigt.'} />;

  return (
    <Card>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.helperHead}
      >
        <Text style={[passkeyStyles.label, { color: colors.primary }]}>Mit E-Mail oder Google bestätigen</Text>
        <Text style={[passkeyStyles.bodySmall, { color: colors.textSecondary }]}>
          Hast du ein Google-, Apple- oder E-Mail-Konto als Helfer eingetragen? Dann melde dich hier damit an.
        </Text>
      </Pressable>
      {open ? (
        thirdwebActive ? (
          <Notice tone="info" text="Auf diesem Handy ist gerade ein anderes Konto angemeldet. Melde es zuerst ab, dann versuche es erneut." />
        ) : (
          <>
            <HelperLogin busy={helperBusy(h)} onLogin={confirm} />
            {h.step === 'confirming' ? (
              <Text style={[passkeyStyles.bodySmall, { color: colors.textSecondary }]}>Dein Helfer-Konto bestätigt …</Text>
            ) : null}
            {h.step === 'failed' && h.message ? <Notice tone="warning" text={h.message} /> : null}
          </>
        )
      ) : null}
    </Card>
  );
}

/**
 * Expert recovery: the NEW 12 words, shown and confirmed (no skip) before the guardians' code
 * appears. Right after the start they are in memory; after leaving the app they are read again
 * behind the device unlock. They are dropped from memory when the app goes to the background.
 */
function NewWords({
  phrase,
  onDrop,
  onConfirmed,
  onStartOver,
}: {
  phrase: string | null;
  onDrop: () => void;
  onConfirmed: () => void;
  onStartOver: () => void;
}) {
  const { colors } = useTheme();
  const [shown, setShown] = useState<string | null>(phrase);
  const [step, setStep] = useState<'show' | 'confirm'>('show');
  const [positions] = useState(() => pickConfirmPositions());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [covered, setCovered] = useState(false);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (a) => {
      setCovered(a === 'inactive');
      if (a !== 'background') return;
      setShown(null);
      setStep('show');
      onDrop();
    });
    return () => sub.remove();
  }, [onDrop]);

  const reveal = async () => {
    setBusy(true);
    setNotice(null);
    try {
      setShown(await phraseStore.read(PHRASE_PROMPT));
    } catch (e) {
      const name = (e as { name?: string } | null)?.name;
      if (name !== 'PhraseCancelledError') setNotice('Die Wörter konnten nicht geöffnet werden. Bitte versuche es erneut.');
    } finally {
      setBusy(false);
    }
  };

  const confirmed = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await phraseStore.markConfirmed();
      setShown(null);
      onConfirmed();
    } catch {
      setNotice('Das hat nicht geklappt. Bitte versuche es erneut.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Text style={[passkeyStyles.lede, { color: colors.textPrimary }]}>Deine neuen 12 Wörter</Text>
      <Text style={[passkeyStyles.body, { color: colors.textSecondary }]}>
        Mit diesen Wörtern gehört dir dein Konto nach der Wiederherstellung. Schreib sie auf Papier, in dieser Reihenfolge.
      </Text>
      {!shown ? (
        <BigButton label="Wörter anzeigen" busy={busy} onPress={reveal} />
      ) : step === 'show' ? (
        <>
          <WordsGrid words={shown.split(' ')} />
          <BigButton label="Ich habe sie aufgeschrieben" onPress={() => setStep('confirm')} />
        </>
      ) : (
        <>
          <WordsConfirm phrase={shown} positions={positions} onConfirmed={confirmed} busy={busy} />
          <BigButton label="Wörter noch einmal ansehen" kind="secondary" onPress={() => setStep('show')} />
        </>
      )}
      <Notice tone="info" text={OLD_KEYS_NOTE} />
      {notice ? <Notice tone="warning" text={notice} /> : null}
      <Pressable onPress={onStartOver} accessibilityRole="button" style={styles.textButton}>
        <Text style={[styles.textButtonLabel, { color: colors.textSecondary }]}>Abbrechen und neu beginnen</Text>
      </Pressable>
      {covered && shown ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} pointerEvents="none" />
      ) : null}
    </>
  );
}

function ChooseMethod({ onChoose }: { onChoose: (m: 'guardians' | 'words') => void }) {
  const { colors } = useTheme();
  return (
    <>
      <Text style={[passkeyStyles.lede, { color: colors.textPrimary }]}>Neues Handy? Wir holen dein Konto zurück.</Text>
      <Text style={[passkeyStyles.body, { color: colors.textSecondary }]}>Wie möchtest du dein Konto zurückholen?</Text>
      <BigButton label="Mit Vertrauenspersonen" onPress={() => onChoose('guardians')} />
      <BigButton label="Mit 12 Wörtern" onPress={() => onChoose('words')} />
    </>
  );
}

/** `name` is shown; `passkeyName` names the new passkey (never the "Konto N" placeholder). */
type WordsHit = WordsWallet & { name: string; passkeyName: string };

/**
 * "Mit 12 Wörtern": the words (checked while typing: unknown word / checksum) → their 5 pool
 * addresses → the accounts they can recover right now → one passkey → the 3-day delay. The seed
 * runs once; the derived kit lives only in a ref until the recovery starts.
 */
function WordsRestore({
  notice,
  busy,
  onStart,
  onBack,
}: {
  notice: string | null;
  busy: boolean;
  onStart: (w: WordsWallet, name: string, phrase: string, kit: WordsKit) => Promise<void>;
  onBack: () => void;
}) {
  const { colors } = useTheme();
  const [looking, setLooking] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [hits, setHits] = useState<WordsHit[] | null>(null);
  const secret = useRef<{ phrase: string; kit: WordsKit } | null>(null);

  useEffect(
    () => () => {
      secret.current = null;
    },
    [],
  );

  const start = async (hit: WordsHit) => {
    const s = secret.current;
    if (!s) return;
    try {
      await onStart(hit, hit.passkeyName, s.phrase, s.kit);
    } finally {
      secret.current = null;
      setHits(null);
    }
  };

  const lookUp = async (phrase: string) => {
    setLooking(true);
    setHint(null);
    setHits(null);
    try {
      // Let the spinner render before the (synchronous) seed derivation.
      await new Promise((r) => setTimeout(r, 0));
      const kit = wordsFromSeed(phrase);
      const found = await findWalletsByWords(kit.addresses(), wordsLookupChain);
      if (found.length === 0) {
        setHint(NO_WORDS_ACCOUNT_MESSAGE);
        return;
      }
      // A migrated account's profile sits under its legacy account.
      const people = await resolvePeopleNow([
        ...found.map((f) => f.wallet),
        ...found.flatMap((f) => (f.recoveryLegacy ? [f.recoveryLegacy] : [])),
      ]).catch(() => new Map());
      const named: WordsHit[] = found.map((f, i) => {
        const own = people.get(f.wallet.toLowerCase());
        const p = own?.known ? own : f.recoveryLegacy ? people.get(f.recoveryLegacy.toLowerCase()) : own;
        return p?.known ? { ...f, name: p.name, passkeyName: p.name } : { ...f, name: `Konto ${i + 1}`, passkeyName: 'Röbel' };
      });
      secret.current = { phrase, kit };
      if (named.length === 1) await start(named[0]);
      else setHits(named);
    } catch (e) {
      setHint(friendlyError(e, 'Keine Verbindung. Bitte versuche es erneut.'));
    } finally {
      setLooking(false);
    }
  };

  if (hits) {
    return (
      <>
        <Text style={[passkeyStyles.lede, { color: colors.textPrimary }]}>Welches Konto möchtest du zurückholen?</Text>
        {hits.map((h) => (
          <Pressable
            key={h.wallet}
            onPress={() => start(h)}
            disabled={busy}
            style={({ pressed }) => [styles.row, { backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={`${h.name} auswählen`}
          >
            <Initials name={h.name} />
            <Text style={[styles.rowName, { color: colors.textPrimary }]} numberOfLines={1}>
              {h.name}
            </Text>
            {busy ? <ActivityIndicator color={colors.primary} /> : null}
          </Pressable>
        ))}
      </>
    );
  }

  return (
    <>
      <Text style={[passkeyStyles.lede, { color: colors.textPrimary }]}>Gib deine 12 Wörter ein</Text>
      <Text style={[passkeyStyles.body, { color: colors.textSecondary }]}>
        Danach richten wir deinen Fingerabdruck auf diesem Handy ein. Dein Konto ist nach 3 Tagen wieder da. So kann niemand
        heimlich ein Konto übernehmen, auch nicht mit den Wörtern.
      </Text>
      {notice ? <Notice tone="info" text={notice} /> : null}
      <WordsInput onValid={lookUp} busy={looking || busy} />
      {hint ? <Notice tone="warning" text={hint} /> : null}
      <Pressable onPress={onBack} accessibilityRole="button" style={styles.textButton}>
        <Text style={[styles.textButtonLabel, { color: colors.textSecondary }]}>Zurück</Text>
      </Pressable>
    </>
  );
}

/**
 * After a words recovery: the keys come back from their words copies (started right away, 2
 * fingerprints). "Weiter" waits for the first attempt; skipping after a failure asks first. A
 * skipped restore stays pending (words-recovery marker) and is offered again in the settings.
 */
function WordsKeyRestore({ wallet, done, onContinue }: { wallet: Address; done: RecoveryState; onContinue: () => void }) {
  const { colors } = useTheme();
  const [phase, setPhase] = useState<'running' | 'done' | 'failed'>('running');
  const [message, setMessage] = useState<string | null>(null);

  const attempt = useCallback(async () => {
    try {
      const rt = await import('@/lib/passkey/derived-keys-runtime');
      const r = await rt.restorePendingWordsKeys(wallet, done);
      setMessage(wordsKeyRestoreMessage(r));
      setPhase('done');
    } catch (e) {
      // No vault key: a retry cannot help (shown as final, no retry button).
      const missing = (e as { name?: string } | null)?.name === WORDS_VAULT_KEY_MISSING;
      setMessage(missing ? WORDS_RESTORE_NO_VAULT_KEY_MESSAGE : friendlyError(e, 'Deine Schlüssel konnten nicht geladen werden. Bitte versuche es erneut.'));
      setPhase(missing ? 'done' : 'failed');
    }
  }, [wallet, done]);

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    attempt().catch(() => undefined);
  }, [attempt]);

  const retry = () => {
    setPhase('running');
    setMessage(null);
    attempt().catch(() => undefined);
  };

  const skip = () =>
    Alert.alert(
      'Schlüssel später zurückholen?',
      'Ohne deine Schlüssel kannst du noch nicht abstimmen und keine Nachrichten lesen. Du kannst sie später in den Einstellungen zurückholen.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Später', onPress: onContinue },
      ],
    );

  return (
    <>
      <Card>
        <Text style={[passkeyStyles.label, { color: colors.textPrimary }]}>Deine Schlüssel zurückholen</Text>
        <Text style={[passkeyStyles.bodySmall, { color: colors.textSecondary }]}>
          Deine Schlüssel für Abstimmungen und Nachrichten waren mit deinen Wörtern gesichert. Bestätige zweimal mit deinem
          Fingerabdruck.
        </Text>
        {phase === 'running' ? <ActivityIndicator color={colors.primary} /> : null}
        {phase === 'done' ? (
          <Notice tone={message ? 'info' : 'success'} text={message ?? 'Deine Schlüssel sind wieder da.'} />
        ) : null}
        {phase === 'failed' && message ? <Notice tone="warning" text={message} /> : null}
        {phase === 'failed' ? <BigButton label="Erneut versuchen" onPress={retry} /> : null}
      </Card>
      <BigButton label="Weiter" disabled={phase === 'running'} onPress={phase === 'failed' ? skip : onContinue} />
    </>
  );
}

function FindAccount({
  onChosen,
  busy,
  notice,
  wordsAllowed,
}: {
  onChosen: (name: string, c: RecoveryCandidate, ownerKind: OwnerKind) => void;
  busy: boolean;
  notice: string | null;
  /** The 'words' surface is open: an expert account is recovered to new words (else to a passkey). */
  wordsAllowed: boolean;
}) {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<PersonSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);
  const [found, setFound] = useState<Found | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    const n = ++seq.current;
    setSearching(true);
    const t = setTimeout(() => {
      searchPeopleByName(q)
        .then((rows) => n === seq.current && setHits(rows))
        .catch(() => n === seq.current && setHint('Die Suche hat nicht geklappt. Bitte versuche es erneut.'))
        .finally(() => n === seq.current && setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const choose = async (hit: PersonSearchHit) => {
    const name = profileName(hit) ?? 'Unbekannte Person';
    setChecking(hit.wallet_address);
    setHint(null);
    try {
      const candidates = await findRecoverableAccounts(getAddress(hit.wallet_address), lookupChain);
      if (candidates.length === 0) {
        setHint(`Für ${name} sind keine Vertrauenspersonen eingerichtet. Dann geht die Wiederherstellung leider nicht.`);
        return;
      }
      // The newest candidate is recovered; its owner decides passkey vs new words (E9).
      const kind: OwnerKind = wordsAllowed ? await readRecoveryOwnerKind(candidates[candidates.length - 1].wallet) : 'passkey';
      setFound({ name, candidates, kind });
    } catch (e) {
      setHint(friendlyError(e, 'Keine Verbindung. Bitte versuche es erneut.'));
    } finally {
      setChecking(null);
    }
  };

  if (found) {
    return (
      <>
        <Card style={{ alignItems: 'center' }}>
          <Initials name={found.name} size={72} />
          <Text style={[passkeyStyles.lede, { color: colors.textPrimary, textAlign: 'center' }]}>{found.name}</Text>
          <Text style={[passkeyStyles.body, { color: colors.textSecondary, textAlign: 'center' }]}>
            {found.kind === 'ecdsa'
              ? 'Du bekommst jetzt neue 12 Wörter für dein Konto. Danach bestätigen deine Vertrauenspersonen, dass du es bist.'
              : 'Wir richten jetzt deinen Fingerabdruck auf diesem Handy ein. Danach bestätigen deine Vertrauenspersonen, dass du es bist.'}
          </Text>
        </Card>
        {found.candidates.length > 1 ? (
          <Notice tone="info" text="Für diese Person gibt es mehrere Konten. Wir nehmen das zuletzt eingerichtete." />
        ) : null}
        <BigButton
          label="Ja, das bin ich"
          busy={busy}
          onPress={() => {
            const c = found.candidates[found.candidates.length - 1];
            if (c) onChosen(found.name, c, found.kind);
          }}
        />
        <Pressable onPress={() => setFound(null)} accessibilityRole="button" style={styles.textButton}>
          <Text style={[styles.textButtonLabel, { color: colors.textSecondary }]}>Andere Person suchen</Text>
        </Pressable>
      </>
    );
  }

  return (
    <>
      <Text style={[passkeyStyles.lede, { color: colors.textPrimary }]}>Neues Handy? Wir holen dein Konto zurück.</Text>
      <Text style={[passkeyStyles.body, { color: colors.textSecondary }]}>
        Das klappt mit Hilfe deiner Vertrauenspersonen. Such zuerst deinen Namen.
      </Text>
      {notice ? <Notice tone="info" text={notice} /> : null}
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Dein Name"
        placeholderTextColor={colors.textTertiary}
        autoCorrect={false}
        style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
      />
      {searching ? <ActivityIndicator color={colors.primary} /> : null}
      {hits.map((hit) => {
        const name = profileName(hit) ?? 'Unbekannte Person';
        return (
          <Pressable
            key={hit.wallet_address}
            onPress={() => choose(hit)}
            disabled={!!checking}
            style={({ pressed }) => [styles.row, { backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={`${name} auswählen`}
          >
            <Initials name={name} />
            <Text style={[styles.rowName, { color: colors.textPrimary }]} numberOfLines={1}>
              {name}
            </Text>
            {checking === hit.wallet_address ? <ActivityIndicator color={colors.primary} /> : null}
          </Pressable>
        );
      })}
      {hint ? <Notice tone="warning" text={hint} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 56, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, fontFamily: fontFamily.regular, fontSize: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, borderRadius: 14, paddingHorizontal: 14 },
  rowName: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: 17 },
  textButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  helperHead: { gap: 4, minHeight: 48 },
  textButtonLabel: { fontFamily: fontFamily.medium, fontSize: 15, textDecorationLine: 'underline' },
});
