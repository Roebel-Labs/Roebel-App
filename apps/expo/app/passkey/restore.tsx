/**
 * "Konto wiederherstellen" on a new phone (reachable from the passkey screen and the login /
 * welcome surfaces while the preview gate is open).
 *   find the person by name → their passkey Safe (on-chain link, needs guardians) → new passkey →
 *   QR for the guardians → they confirm on-chain → start (3-day delay, fingerprint) → countdown →
 *   finish (fingerprint) → this phone operates the recovered Safe.
 * All logic is in lib/passkey/recovery-flow.ts; the state is persisted, so leaving is safe.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { getAddress } from 'viem';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { BigButton, Card, Initials, Notice, ScreenHeader, friendlyError, passkeyStyles, usePasskeyGate } from '@/components/passkey/PasskeyUi';
import PasskeyQrCard from '@/components/passkey/PasskeyQrCard';
import { buildRecoverLink } from '@/lib/passkey/deeplinks';
import { profileName } from '@/lib/passkey/people';
import {
  clearRecoveryState,
  executeRecoveryStep,
  finalizeRecoveryStep,
  formatRemaining,
  loadRecoveryState,
  pollRecovery,
  resumeRecovery,
  startRecovery,
  type RecoveryState,
} from '@/lib/passkey/recovery-flow';
import { findRecoverableAccounts, type RecoveryCandidate } from '@/lib/passkey/recovery-lookup';
import {
  createRecoveryDeps,
  lookupChain,
  recoveryStorage,
  searchPeopleByName,
  type PersonSearchHit,
} from '@/lib/passkey/guardians-runtime';

const deps = createRecoveryDeps();

type Found = { name: string; candidates: RecoveryCandidate[] };

export default function RestoreAccountScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const allowed = usePasskeyGate();
  const [state, setState] = useState<RecoveryState | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const stateRef = useRef<RecoveryState | null | undefined>(undefined);
  stateRef.current = state;

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
    await clearRecoveryState(recoveryStorage).catch(() => undefined);
    setState(null);
  }, []);

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
        {!state || state.step === 'idle' || state.step === 'creatingPasskey' ? (
          <FindAccount
            notice={state?.message ?? null}
            onChosen={async (name, c) => {
              setBusy(true);
              try {
                setState(await startRecovery({ wallet: c.wallet, name, recoveryLegacy: c.recoveryLegacy }, deps));
              } finally {
                setBusy(false);
              }
            }}
            busy={busy}
          />
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
            {state.message ? <Notice tone="warning" text={state.message} /> : null}
            <Pressable onPress={startOver} accessibilityRole="button" style={styles.textButton}>
              <Text style={[styles.textButtonLabel, { color: colors.textSecondary }]}>Abbrechen und neu beginnen</Text>
            </Pressable>
          </>
        ) : state.step === 'executing' ? (
          <>
            <Text style={[passkeyStyles.lede, { color: colors.textPrimary }]}>Genug Vertrauenspersonen haben bestätigt.</Text>
            <Text style={[passkeyStyles.body, { color: colors.textSecondary }]}>
              Jetzt startest du die Wiederherstellung mit deinem Fingerabdruck. Danach dauert es 3 Tage, bis dein Konto wieder da
              ist. So kann niemand heimlich dein Konto übernehmen.
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
            {state.message ? <Notice tone="warning" text={state.message} /> : null}
          </>
        ) : state.step === 'finalizing' ? (
          <>
            <Text style={[passkeyStyles.lede, { color: colors.textPrimary }]}>Es ist so weit.</Text>
            <Text style={[passkeyStyles.body, { color: colors.textSecondary }]}>Hol dein Konto mit deinem Fingerabdruck zurück.</Text>
            {state.message ? <Notice tone="warning" text={state.message} /> : null}
            <BigButton label="Konto zurückholen" busy={busy} onPress={() => act((s) => finalizeRecoveryStep(s, deps))} />
          </>
        ) : state.step === 'done' ? (
          <>
            <Text style={[passkeyStyles.lede, { color: colors.textPrimary }]}>Dein Konto ist wieder da.</Text>
            <Text style={[passkeyStyles.body, { color: colors.textSecondary }]}>Ab jetzt meldest du dich mit deinem Fingerabdruck an.</Text>
            <BigButton
              label="Weiter"
              onPress={async () => {
                await clearRecoveryState(recoveryStorage).catch(() => undefined);
                router.replace('/settings/passkey' as any);
              }}
            />
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

function FindAccount({
  onChosen,
  busy,
  notice,
}: {
  onChosen: (name: string, c: RecoveryCandidate) => void;
  busy: boolean;
  notice: string | null;
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
      setFound({ name, candidates });
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
            Wir richten jetzt deinen Fingerabdruck auf diesem Handy ein. Danach bestätigen deine Vertrauenspersonen, dass du es
            bist.
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
            if (c) onChosen(found.name, c);
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
  textButtonLabel: { fontFamily: fontFamily.medium, fontSize: 15, textDecorationLine: 'underline' },
});
