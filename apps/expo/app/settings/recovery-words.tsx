/**
 * Settings → Wiederherstellungswörter (gated by the 'words' surface).
 *
 * intro → show (12 words, once) → confirm (3 of them) → saving (fingerprint for the op, one more
 * for the backup write) → done. With words already on: the status plus "Neue Wörter erzeugen"
 * (the same flow with replace) and "Wörter entfernen".
 *
 * The phrase lives only in this screen's state: gone on unmount, cleared after saving and as soon as
 * the app goes to the background (the flow then starts over); while 'inactive' (app switcher) a
 * blank cover hides them. No copy button, no clipboard.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useActiveAccount } from 'thirdweb/react';
import type { Address } from 'viem';

import { useTheme } from '@/context/ThemeContext';
import { BigButton, Card, Notice, ScreenHeader, friendlyError, passkeyStyles, usePasskeyGate } from '@/components/passkey/PasskeyUi';
import WordsConfirm from '@/components/passkey/WordsConfirm';
import WordsGrid from '@/components/passkey/WordsGrid';
import { passkeySessionOf } from '@/lib/passkey/active';
import { loadMigrationRecord, type MigrationRecord } from '@/lib/passkey/migration';
import { secureKeyValueStorage } from '@/lib/passkey/migration-runtime';
import type { PasskeySession } from '@/lib/passkey/session';
import { generatePhrase, pickConfirmPositions } from '@/lib/passkey/words';
import type { WordsPending } from '@/lib/passkey/words-setup';

type Step = 'loading' | 'status' | 'intro' | 'show' | 'confirm' | 'saving' | 'done';

const DONE_TEXT = 'Fertig. Wir haben die Wörter nicht gespeichert.';
const INCOMPLETE_TEXT = 'Dein Konto ist gesichert. Abstimmungs- und Nachrichtenschlüssel sichern wir beim nächsten Mal mit.';

type Ctx = { record: MigrationRecord; session: PasskeySession };

export default function RecoveryWordsScreen() {
  const { colors } = useTheme();
  const account = useActiveAccount();
  const allowed = usePasskeyGate('words');

  const [ctx, setCtx] = useState<Ctx | null | undefined>(undefined);
  const [step, setStep] = useState<Step>('loading');
  const [pending, setPending] = useState<WordsPending | null>(null);
  const [replace, setReplace] = useState(false);
  const [positions, setPositions] = useState<[number, number, number]>([0, 1, 2]);
  const [incomplete, setIncomplete] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState<'remove' | 'retry' | null>(null);
  const [notice, setNotice] = useState<{ tone: 'error' | 'success' | 'info'; text: string } | null>(null);
  // The phrase is screen state only (lint forbids reading a ref in render); `held` lets the
  // AppState listener see it without re-subscribing.
  const [phrase, setPhrase] = useState<string | null>(null);
  const held = useRef(false);
  // iOS takes the app-switcher snapshot while 'inactive': the words are covered then.
  const [covered, setCovered] = useState(false);

  const forget = useCallback(() => {
    held.current = false;
    setPhrase(null);
  }, []);

  const refresh = useCallback(async (c: Ctx) => {
    const [{ readWordsStatus }, { readGuardianState, recoveryStorage }] = await Promise.all([
      import('@/lib/passkey/words-setup'),
      import('@/lib/passkey/guardians-runtime'),
    ]);
    const s = await readWordsStatus(c.record.safe, { storage: recoveryStorage, readState: readGuardianState });
    setPending(s.pending);
    setStep(s.on ? 'status' : 'intro');
  }, []);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    (async () => {
      try {
        const [record, rt] = await Promise.all([
          loadMigrationRecord(secureKeyValueStorage).catch(() => null),
          import('@/lib/passkey/detach-runtime'),
        ]);
        const session = await rt.actingPasskeySession(passkeySessionOf<PasskeySession>(account), account?.address as Address | undefined);
        if (cancelled) return;
        const c = record && session ? { record, session } : null;
        setCtx(c);
        if (c) await refresh(c);
      } catch (e) {
        if (!cancelled) {
          setNotice({ tone: 'error', text: friendlyError(e, 'Der Status konnte gerade nicht gelesen werden.') ?? '' });
          setStep('intro');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allowed, account, refresh]);

  // The words never outlive the screen, and never sit in memory while the app is in the background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      setCovered(state === 'inactive');
      // 'background' only: the passkey sheet makes iOS report 'inactive' while we save.
      if (state !== 'background' || !held.current) return;
      forget();
      setStep((s) => (s === 'show' || s === 'confirm' ? 'intro' : s));
    });
    return () => {
      sub.remove();
      held.current = false;
    };
  }, [forget]);

  const start = (asReplace: boolean) => {
    setPhrase(generatePhrase());
    held.current = true;
    setPositions(pickConfirmPositions());
    setReplace(asReplace);
    setNotice(null);
    setStep('show');
  };

  const mode = async (c: Ctx) => {
    const rt = await import('@/lib/passkey/words-setup-runtime');
    const m = await rt.wordsIdentityMode(c.record);
    if (!m) throw new Error(c.record.legacy ? 'Das geht erst, wenn dein Passkey mit deinem Bürgerkonto verbunden ist.' : 'Das geht gerade nicht. Versuche es gleich noch einmal.');
    return rt.createWordsSetupDeps(c.record, c.session, m);
  };

  const save = async () => {
    if (!ctx || !phrase) return;
    setStep('saving');
    setNotice(null);
    try {
      const deps = await mode(ctx);
      const { enableRecoveryWords, loadWordsPending } = await import('@/lib/passkey/words-setup');
      const r = await enableRecoveryWords({ safe: ctx.record.safe, phrase, ...(replace ? { replace: true } : {}) }, deps);
      if (r.status === 'error') {
        setNotice({ tone: 'error', text: r.message });
        setStep('confirm');
        return;
      }
      forget();
      const left = await loadWordsPending(deps.storage).catch(() => null);
      setPending(left);
      setIncomplete(r.copies.failed.length > 0 || left !== null);
      setStep('done');
    } catch (e) {
      const msg = e instanceof Error && !/^0x|HTTP|fetch/i.test(e.message) ? e.message : friendlyError(e);
      if (msg) setNotice({ tone: 'error', text: msg });
      setStep('confirm');
    }
  };

  const remove = async () => {
    if (!ctx) return;
    setBusy('remove');
    setNotice(null);
    try {
      const deps = await mode(ctx);
      const { disableRecoveryWords } = await import('@/lib/passkey/words-setup');
      const r = await disableRecoveryWords({ safe: ctx.record.safe }, deps);
      if (r.status === 'error') {
        setNotice({ tone: 'error', text: r.message });
        return;
      }
      setConfirmRemove(false);
      setNotice({ tone: 'success', text: 'Die Wiederherstellungswörter sind entfernt.' });
      await refresh(ctx);
    } catch (e) {
      const msg = friendlyError(e);
      if (msg) setNotice({ tone: 'error', text: msg });
    } finally {
      setBusy(null);
    }
  };

  const retry = async () => {
    if (!ctx) return;
    setBusy('retry');
    setNotice(null);
    try {
      const deps = await mode(ctx);
      const { retryWordsBackup } = await import('@/lib/passkey/words-setup');
      const r = await retryWordsBackup({ safe: ctx.record.safe }, deps);
      if (r.status === 'error') setNotice({ tone: 'error', text: r.message });
      else setNotice({ tone: 'success', text: 'Gesichert.' });
      await refresh(ctx);
    } catch (e) {
      const msg = friendlyError(e);
      if (msg) setNotice({ tone: 'error', text: msg });
    } finally {
      setBusy(null);
    }
  };

  if (!allowed || ctx === undefined || step === 'loading') {
    return (
      <SafeAreaView style={[passkeyStyles.container, { backgroundColor: colors.background }]}>
        <View style={passkeyStyles.center}>{allowed === false ? null : <ActivityIndicator color={colors.primary} />}</View>
      </SafeAreaView>
    );
  }

  const body = (t: string) => <Text style={[passkeyStyles.body, { color: colors.textSecondary }]}>{t}</Text>;
  const pendingNotice = pending ? (
    <Card>
      <Text style={[passkeyStyles.bodySmall, { color: colors.textSecondary }]}>
        {pending === 'on' ? INCOMPLETE_TEXT : 'Die alten Wörter sind entfernt. Ihre Sicherung räumen wir noch auf.'}
      </Text>
      <BigButton label="Jetzt sichern" kind="secondary" busy={busy === 'retry'} onPress={retry} />
    </Card>
  ) : null;

  return (
    <SafeAreaView style={[passkeyStyles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title="Wiederherstellungswörter" />
      <ScrollView contentContainerStyle={passkeyStyles.content} keyboardShouldPersistTaps="handled">
        {ctx === null ? (
          <Notice tone="info" text="Auf diesem Gerät ist kein verbundener Passkey eingerichtet." />
        ) : step === 'status' ? (
          <>
            <Card>
              <Text style={[passkeyStyles.label, { color: colors.textPrimary }]}>Wiederherstellungswörter</Text>
              <Text style={[passkeyStyles.bodySmall, { color: colors.textSecondary }]}>Eingerichtet. Reichen allein aus, Wartezeit 3 Tage.</Text>
            </Card>
            {pendingNotice}
            <BigButton label="Neue Wörter erzeugen" onPress={() => start(true)} />
            {confirmRemove ? (
              <Card>
                {body('Ohne die Wörter hilft dir nur noch, wer deine Vertrauensperson ist. Wirklich entfernen?')}
                <View style={styles.row}>
                  <BigButton label="Ja, entfernen" kind="danger" busy={busy === 'remove'} onPress={remove} style={styles.flex} />
                  <BigButton label="Nein" kind="secondary" onPress={() => setConfirmRemove(false)} style={styles.flex} />
                </View>
              </Card>
            ) : (
              <BigButton label="Wörter entfernen" kind="secondary" onPress={() => setConfirmRemove(true)} />
            )}
          </>
        ) : step === 'intro' ? (
          <>
            <Text style={[passkeyStyles.lede, { color: colors.textPrimary }]}>Wiederherstellungswörter</Text>
            {body('12 Wörter, mit denen du dein Konto auf einem neuen Handy zurückholst. Ohne Apple, ohne Google, ohne Vertrauenspersonen und ohne uns.')}
            {body('Wer die Wörter hat, kann dein Konto nach 3 Tagen übernehmen. In dieser Zeit wirst du gewarnt und kannst es abbrechen.')}
            {pendingNotice}
            <BigButton label="Wörter erzeugen" onPress={() => start(false)} />
          </>
        ) : step === 'show' ? (
          <>
            {body('Schreib die Wörter auf Papier, in dieser Reihenfolge. Wir zeigen sie nur dieses eine Mal.')}
            <WordsGrid words={(phrase ?? '').split(' ')} />
            <BigButton label="Ich habe sie aufgeschrieben" onPress={() => setStep('confirm')} />
          </>
        ) : step === 'confirm' || step === 'saving' ? (
          <>
            <WordsConfirm phrase={phrase ?? ''} positions={positions} onConfirmed={save} busy={step === 'saving'} />
            {step === 'confirm' ? <BigButton label="Wörter noch einmal ansehen" kind="secondary" onPress={() => setStep('show')} /> : null}
          </>
        ) : (
          <>
            <Text style={[passkeyStyles.lede, { color: colors.textPrimary }]}>{DONE_TEXT}</Text>
            {incomplete ? <Notice tone="info" text={INCOMPLETE_TEXT} /> : null}
            {incomplete && pending ? <BigButton label="Jetzt sichern" kind="secondary" busy={busy === 'retry'} onPress={retry} /> : null}
          </>
        )}
        {notice ? <Notice tone={notice.tone} text={notice.text} /> : null}
      </ScrollView>
      {covered && (step === 'show' || step === 'confirm') ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} pointerEvents="none" />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1 },
});
