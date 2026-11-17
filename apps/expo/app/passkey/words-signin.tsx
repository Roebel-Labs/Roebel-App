/**
 * "Mit 12 Wörtern anmelden" (expert path, gated by the 'words' surface): the typed words open the
 * account they own (words-account.ts `signInWithWords`). When words are stored on this device,
 * "Gespeichertes Konto auf diesem Gerät öffnen" opens that account with one device unlock instead.
 *
 * A dismissed unlock prompt keeps the typed words (WordsInput stays mounted with its text). When
 * the device holds the unconfirmed words of another account (E4), the person may — on an explicit
 * tap only — let the app drop them if they are no longer readable (`discardIfUnreadable`).
 *
 * "Backup-Datei öffnen" (plan 4, only when the binary has the document picker): pick → format check
 * (a file that is not ours is refused before the password field appears) → password → decrypt +
 * the same sign-in as typed words (backup-import.ts). Decrypting can take long (the file sets the
 * iteration count), so the screen shows "Datei wird geöffnet …" and ignores further taps. The
 * password is cleared after every attempt; the decrypted words never reach this screen.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useSetActiveWallet } from 'thirdweb/react';

import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { BigButton, Card, Notice, ScreenHeader, passkeyStyles, usePasskeyGate } from '@/components/passkey/PasskeyUi';
import WordsInput from '@/components/passkey/WordsInput';
import { backupFileSupport } from '@/lib/passkey/backup-file-native';
import type { WordsResult } from '@/lib/passkey/words-account';

type Busy = 'typed' | 'stored' | 'discard' | 'pick' | 'backup' | null;
type NoticeState = { tone: 'error' | 'info' | 'success'; text: string } | null;

const SEARCHING_TEXT = 'Konto wird gesucht …';
const OPENING_TEXT = 'Datei wird geöffnet …';

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
  const [canPick] = useState(() => backupFileSupport().pick);
  // The picked file (ciphertext only) after it passed the format check, and its password.
  const [backupContent, setBackupContent] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [opening, setOpening] = useState(false);
  // State updates are async: a second tap in the same frame must not start a second run.
  const inFlight = useRef(false);

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

  const run = async (kind: 'typed' | 'stored' | 'backup', phrase?: string) => {
    if (busy || inFlight.current) return;
    if (kind === 'backup' && (!backupContent || password.length === 0)) return;
    inFlight.current = true;
    setBusy(kind);
    if (kind === 'backup') setOpening(true);
    setNotice(null);
    setOverwrite(false);
    setRecoveryRoute(null);
    try {
      const [account, { createWordsAccountDeps }] = await Promise.all([
        import('@/lib/passkey/words-account'),
        import('@/lib/passkey/words-account-runtime'),
      ]);
      const deps = createWordsAccountDeps();
      let r: WordsResult;
      if (kind === 'backup') {
        if (!backupContent) return;
        const [{ signInFromBackup }, { pbkdf2Native }] = await Promise.all([
          import('@/lib/passkey/backup-import'),
          import('@/lib/passkey/backup-file-native'),
        ]);
        const typed = password;
        setPassword('');
        r = await signInFromBackup(
          { content: backupContent, password: typed },
          {
            pbkdf2: pbkdf2Native,
            signIn: (words) => account.signInWithWords(words, deps),
            markExported: () => deps.phrase.markBackupExported(),
            onOpened: () => setOpening(false),
          },
        );
      } else {
        r = kind === 'typed' && phrase ? await account.signInWithWords(phrase, deps) : await account.openStoredWordsAccount(deps);
      }
      await handle(r);
    } catch {
      setNotice({ tone: 'error', text: 'Das hat nicht geklappt. Bitte versuche es erneut.' });
    } finally {
      inFlight.current = false;
      setOpening(false);
      setBusy(null);
    }
  };

  // "Backup-Datei öffnen": the picker checks the size before reading; the format check runs before any password.
  const pick = async () => {
    if (busy || inFlight.current) return;
    inFlight.current = true;
    setBusy('pick');
    setNotice(null);
    setOverwrite(false);
    setRecoveryRoute(null);
    try {
      const [{ pickBackupFile }, { checkBackupFile }] = await Promise.all([
        import('@/lib/passkey/backup-file-native'),
        import('@/lib/passkey/backup-import'),
      ]);
      const picked = await pickBackupFile();
      if (picked.status === 'cancelled') return;
      if (picked.status === 'error') {
        setNotice({ tone: 'error', text: picked.message });
        return;
      }
      const check = checkBackupFile(picked.content);
      if (!check.ok) {
        setNotice({ tone: 'error', text: check.message });
        return;
      }
      setPassword('');
      setBackupContent(picked.content);
    } catch {
      setNotice({ tone: 'error', text: 'Das hat nicht geklappt. Bitte versuche es erneut.' });
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  const closeBackup = () => {
    if (busy === 'backup') return;
    setBackupContent(null);
    setPassword('');
    setNotice(null);
    setOverwrite(false);
  };

  // E4 escape, on an explicit tap only: costs one unlock prompt if the stored words are readable.
  const discard = async () => {
    if (busy || inFlight.current) return;
    inFlight.current = true;
    setBusy('discard');
    try {
      const { phraseStore } = await import('@/lib/passkey/phrase-store-runtime');
      const removed = await phraseStore.discardIfUnreadable();
      if (removed) {
        setOverwrite(false);
        setHasStored(false);
        setNotice({
          tone: 'success',
          text: backupContent
            ? 'Die nicht mehr lesbaren Wörter sind entfernt. Gib das Passwort noch einmal ein und tippe auf „Datei öffnen".'
            : 'Die nicht mehr lesbaren Wörter sind entfernt. Tippe noch einmal auf „Weiter".',
        });
      } else {
        setNotice({
          tone: 'info',
          text: 'Die gespeicherten Wörter sind lesbar und bleiben auf diesem Gerät. Öffne zuerst das gespeicherte Konto und bestätige die Wörter.',
        });
      }
    } catch {
      // A dismissed prompt changes nothing.
    } finally {
      inFlight.current = false;
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
        {canPick && !backupContent ? (
          <Pressable
            onPress={() => void pick()}
            disabled={!!busy}
            accessibilityRole="button"
            accessibilityState={{ disabled: !!busy, busy: busy === 'pick' }}
            style={[styles.textButton, { opacity: busy ? 0.5 : 1 }]}
          >
            <Text style={[styles.textButtonLabel, { color: colors.primary }]}>Backup-Datei öffnen</Text>
          </Pressable>
        ) : null}
        {backupContent ? (
          <Card>
            <Text style={[passkeyStyles.label, { color: colors.textPrimary }]}>Backup-Datei öffnen</Text>
            <Text style={[passkeyStyles.bodySmall, { color: colors.textSecondary }]}>Gib das Passwort der Backup-Datei ein.</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              textContentType="password"
              editable={busy !== 'backup'}
              placeholder="Passwort"
              placeholderTextColor={colors.textTertiary}
              accessibilityLabel="Passwort"
              onSubmitEditing={() => void run('backup')}
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
            />
            <BigButton
              label="Datei öffnen"
              busy={busy === 'backup'}
              disabled={password.length === 0 || (!!busy && busy !== 'backup')}
              onPress={() => void run('backup')}
            />
            <BigButton label="Abbrechen" kind="secondary" disabled={busy === 'backup'} onPress={closeBackup} />
          </Card>
        ) : null}
        {busy === 'backup' && opening ? <Notice tone="info" text={OPENING_TEXT} /> : null}
        {busy === 'typed' || busy === 'stored' || (busy === 'backup' && !opening) ? <Notice tone="info" text={SEARCHING_TEXT} /> : null}
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

const styles = StyleSheet.create({
  textButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  textButtonLabel: { fontFamily: fontFamily.medium, fontSize: 15, textDecorationLine: 'underline' },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontFamily: fontFamily.medium, fontSize: 17 },
});
