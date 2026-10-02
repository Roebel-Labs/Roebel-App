import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { useGoBack } from '@/hooks/useGoBack';
import { ArrowLeftIcon } from '@/components/Icons';
import MeckyNotFound from '@/components/MeckyNotFound';
import MuenzenRewardOverlay from '@/components/rewards/MuenzenRewardOverlay';
import { signQueued } from '@/lib/signed-request';
import { DECRYPT_REWARD_MUENZEN, fetchDecryptProposal, type DecryptProposal } from '@/lib/vorhaben-decrypt';

/**
 * "Wahlergebnis entschlüsseln": a Wahlhelfer:in releases their part of the election key. Once 3 of 5
 * parts are in, the key exists briefly in memory, the ZK proofs are computed and the result goes
 * on-chain. No result is visible before that.
 *
 * Until the key ceremony has run, the release is a walkthrough on the real proposal: real wallet
 * signatures, real-length timings, nothing is sent. The pipeline stops at "Ergebnis veröffentlichen"
 * until the real result is published; only then is it shown.
 */

const storageKey = (proposalKey: string) => `vorhaben.decrypt.${proposalKey.toLowerCase()}`;
/** Index of "Ergebnis veröffentlichen": the walkthrough never passes it on its own. */
const PUBLISH_IDX = 4;
const RESULT_POLL_MS = 30_000;

/** Pipeline after the threshold is met; `end` = seconds after the third part arrived. */
const PIPELINE: { label: string; detail: string; end: number; minutes?: number }[] = [
  { label: 'Wahlschlüssel zusammensetzen', detail: 'Aus 3 Teilen entsteht kurz der Wahlschlüssel – nur im Arbeitsspeicher, nie gespeichert.', end: 20 },
  { label: 'Stimmen versiegeln', detail: 'Alle Anmeldungen und verschlüsselten Stimmen werden on-chain festgeschrieben (ca. 30 Sek.).', end: 50 },
  { label: 'Zero-Knowledge-Beweise berechnen', detail: 'Der lange Schritt: beweist, dass richtig gezählt wurde, ohne eine einzige Stimme offenzulegen.', end: 650, minutes: 10 },
  { label: 'Beweise on-chain prüfen', detail: 'Der Prüfvertrag auf Gnosis kontrolliert jeden Beweis.', end: 770 },
  { label: 'Ergebnis veröffentlichen', detail: 'Die Auszählung wird in den Auszählungsvertrag geschrieben.', end: 830 },
  { label: 'Gegenprüfung', detail: 'Die veröffentlichten Werte werden unabhängig nachgerechnet. Danach wird der Wahlschlüssel gelöscht.', end: 850 },
];
const WAIT_FROM = PIPELINE[PUBLISH_IDX - 1].end;

type Phase = 'idle' | 'sign1' | 'decrypting' | 'sign2' | 'sending';

export default function DecryptResultScreen() {
  const { colors } = useTheme();
  const goBack = useGoBack();
  const account = useActiveAccount();
  const { proposalId } = useLocalSearchParams<{ proposalId: string }>();
  const [proposal, setProposal] = useState<DecryptProposal | null | undefined>(undefined);
  const [startedAt, setStartedAt] = useState<number | null | undefined>(undefined);
  const [now, setNow] = useState(Date.now());
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [reward, setReward] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!proposalId) return;
    fetchDecryptProposal(proposalId).then(setProposal);
    AsyncStorage.getItem(storageKey(proposalId))
      .then((v) => setStartedAt(v ? Number(v) || null : null))
      .catch(() => setStartedAt(null));
  }, [proposalId]);

  const result = proposal?.result ?? null;
  const elapsed = startedAt ? (now - startedAt) / 1000 : -1;
  const finished = !!result;
  const waitingForResult = !finished && startedAt != null && elapsed >= WAIT_FROM;

  useEffect(() => {
    if (!startedAt || finished || waitingForResult) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt, finished, waitingForResult]);

  // The last steps wait for the real tally: re-read the proposal until its result is published.
  useEffect(() => {
    if (!waitingForResult || !proposalId) return;
    const t = setInterval(() => { fetchDecryptProposal(proposalId).then((p) => { if (p) setProposal(p); }); }, RESULT_POLL_MS);
    return () => clearInterval(t);
  }, [waitingForResult, proposalId]);

  const release = useCallback(async () => {
    if (busyRef.current || !account || !proposal) return;
    const n = proposal.proposalNumber;
    busyRef.current = true;
    setError(null);
    try {
      setPhase('sign1');
      await signQueued(account, `Röbel Wahlhelfer:in: Schlüsselteil für Vorschlag #${n} öffnen.`);
      setPhase('decrypting');
      await new Promise((r) => setTimeout(r, 1200));
      setPhase('sign2');
      await signQueued(account, `Röbel Wahlhelfer:in: Schlüsselteil für Vorschlag #${n} an die Auszählung übergeben.`);
      setPhase('sending');
      await new Promise((r) => setTimeout(r, 1500));
      const t = Date.now();
      await AsyncStorage.setItem(storageKey(proposal.proposalKey), String(t)).catch(() => {});
      setStartedAt(t);
      setNow(t);
      setReward(true);
    } catch {
      setError('Signatur abgebrochen oder fehlgeschlagen.');
    } finally {
      setPhase('idle');
      busyRef.current = false;
    }
  }, [account, proposal]);

  const header = (
    <View style={[styles.header, { borderBottomColor: colors.border }]}>
      <Pressable onPress={goBack} style={styles.back} accessibilityRole="button" accessibilityLabel="Zurück">
        <ArrowLeftIcon size={24} color={colors.textPrimary} />
      </Pressable>
      <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Wahlergebnis entschlüsseln</Text>
      <View style={{ width: 40 }} />
    </View>
  );

  if (proposal === null) {
    return (
      <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]}>
        {header}
        <MeckyNotFound title="Vorschlag nicht gefunden" />
      </SafeAreaView>
    );
  }
  if (proposal === undefined || startedAt === undefined) {
    return (
      <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]}>
        {header}
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      </SafeAreaView>
    );
  }

  const released = !!startedAt || finished;
  const partsIn = released ? 3 : 2;
  // Index of the running pipeline step (-1 = waiting for parts, PIPELINE.length = all done).
  const activeIdx = finished ? PIPELINE.length : !startedAt ? -1 : waitingForResult ? PUBLISH_IDX : PIPELINE.findIndex((s) => elapsed < s.end);
  const busy = phase !== 'idle';
  const phaseLabel: Record<Phase, string> = {
    idle: 'Wahlergebnis entschlüsseln',
    sign1: 'Bitte in der Wallet bestätigen …',
    decrypting: 'Dein Schlüsselteil wird geöffnet …',
    sign2: 'Bitte noch einmal bestätigen …',
    sending: 'Wird an die Auszählung übergeben …',
  };

  const steps = [
    {
      label: 'Schlüsselteile sammeln',
      detail: `Wahlhelfer:innen geben ihren Teil des Wahlschlüssels frei – ${partsIn} von 3.`,
      done: released, active: !released, progress: null as number | null, remaining: null as string | null,
    },
    ...PIPELINE.map((s, i) => {
      const start = i === 0 ? 0 : PIPELINE[i - 1].end;
      const isActive = i === activeIdx;
      const frac = isActive ? Math.min(1, Math.max(0, (elapsed - start) / (s.end - start))) : null;
      const left = isActive && s.minutes ? Math.max(1, Math.ceil((s.end - elapsed) / 60)) : null;
      return {
        label: s.label,
        detail: s.detail,
        done: activeIdx > i,
        active: isActive,
        progress: s.minutes ? frac : null,
        remaining: left ? `noch ca. ${left} Min.` : null,
      };
    }),
  ];

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]}>
      {header}
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.kicker, { color: colors.textSecondary }]}>Vorschlag #{proposal.proposalNumber}</Text>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{proposal.title}</Text>

        {finished && result ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardHead, { color: colors.textPrimary }]}>Ergebnis</Text>
            {[['Ja', result.forVotes], ['Nein', result.againstVotes], ['Enthaltung', result.abstainVotes]].map(([l, v]) => (
              <View key={l} style={styles.row}>
                <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>{l}</Text>
                <Text style={[styles.rowValue, { color: colors.textPrimary }]}>{v}</Text>
              </View>
            ))}
            <Text style={[styles.body, { color: colors.textSecondary, marginTop: 6 }]}>Veröffentlicht. Der Wahlschlüssel ist gelöscht.</Text>
          </View>
        ) : proposal.votingOpen ? (
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            Die Abstimmung läuft noch. Sobald sie beendet ist, kannst du hier deinen Teil des Wahlschlüssels freigeben.
          </Text>
        ) : (
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            Die Abstimmung ist beendet. Alle Stimmen sind verschlüsselt – niemand kennt das Ergebnis. Erst wenn 3 von 5
            Wahlhelfer:innen ihren Teil des Wahlschlüssels freigeben, kann gezählt werden.
          </Text>
        )}

        <View style={styles.stepper}>
          {steps.map((s, i) => {
            const last = i === steps.length - 1;
            const dotColor = s.done ? colors.success : s.active ? colors.primary : colors.border;
            return (
              <View key={s.label} style={styles.step}>
                <View style={styles.rail}>
                  <View style={[styles.dot, { backgroundColor: s.done || s.active ? dotColor : colors.background, borderColor: dotColor }]}>
                    {s.done ? <Text style={[styles.check, { color: colors.onPrimary }]}>✓</Text> : null}
                  </View>
                  {!last && <View style={[styles.connector, { backgroundColor: s.done ? colors.success : colors.border }]} />}
                </View>
                <View style={[styles.stepBody, !last && { paddingBottom: 18 }]}>
                  <View style={styles.stepHead}>
                    <Text style={[styles.stepLabel, { color: s.done || s.active ? colors.textPrimary : colors.textSecondary, fontFamily: s.active ? fontFamily.semiBold : fontFamily.medium }]}>
                      {s.label}
                    </Text>
                    {s.active && released ? <ActivityIndicator size="small" color={colors.primary} /> : null}
                  </View>
                  <Text style={[styles.stepDetail, { color: colors.textSecondary }]}>{s.detail}</Text>
                  {s.progress != null && (
                    <View style={[styles.track, { backgroundColor: colors.surfaceSecondary }]}>
                      <View style={[styles.fill, { backgroundColor: colors.primary, width: `${Math.round(s.progress * 100)}%` }]} />
                    </View>
                  )}
                  {s.remaining && <Text style={[styles.remaining, { color: colors.textSecondary }]}>{s.remaining}</Text>}
                </View>
              </View>
            );
          })}
        </View>

        {finished || proposal.votingOpen ? null : !startedAt ? (
          <>
            <Text style={[styles.note, { color: colors.textSecondary }]}>
              Deine Wallet bestätigt zweimal: einmal, um deinen Schlüsselteil auf diesem Gerät zu öffnen, und einmal, um ihn
              an die Auszählung zu übergeben. Als Dank erhältst du {DECRYPT_REWARD_MUENZEN} Röbel Münzen.
            </Text>
            {error && <Text style={[styles.error, { color: colors.error }]}>{error}</Text>}
            <Pressable disabled={busy || !account} onPress={release} accessibilityRole="button"
              style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary, opacity: busy || !account ? 0.6 : pressed ? 0.85 : 1 }]}>
              {busy && <ActivityIndicator color={colors.onPrimary} style={{ marginRight: 8 }} />}
              <Text style={[styles.primaryText, { color: colors.onPrimary }]}>{phaseLabel[phase]}</Text>
            </Pressable>
          </>
        ) : (
          <Text style={[styles.note, { color: colors.textSecondary }]}>
            Danke, dein Schlüsselteil ist angekommen. Die Auszählung läuft jetzt von selbst weiter – du kannst die App
            schließen. Das Ergebnis erscheint hier, sobald alle Beweise geprüft und veröffentlicht sind.
          </Text>
        )}
      </ScrollView>

      <MuenzenRewardOverlay
        visible={reward}
        amount={DECRYPT_REWARD_MUENZEN}
        subtitle="Danke fürs Entschlüsseln, Wahlhelfer:in."
        onClose={() => setReward(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, height: 52, borderBottomWidth: StyleSheet.hairlineWidth },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: fontFamily.semiBold, fontSize: 17 },
  content: { padding: 20, gap: 18, paddingBottom: 60 },
  kicker: { fontFamily: fontFamily.medium, fontSize: 13 },
  title: { fontFamily: fontFamily.heading, fontSize: 22, lineHeight: 28 },
  body: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 21 },
  note: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20 },
  card: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 },
  cardHead: { fontFamily: fontFamily.semiBold, fontSize: 16, marginBottom: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  rowLabel: { fontFamily: fontFamily.regular, fontSize: 15 },
  rowValue: { fontFamily: fontFamily.semiBold, fontSize: 15 },
  stepper: { paddingTop: 4 },
  step: { flexDirection: 'row', gap: 12 },
  rail: { alignItems: 'center', width: 22 },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  check: { fontSize: 12, lineHeight: 14, fontFamily: fontFamily.bold },
  connector: { width: 2, flex: 1, marginVertical: 2 },
  stepBody: { flex: 1, gap: 3 },
  stepHead: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 22 },
  stepLabel: { fontSize: 15, lineHeight: 20, flexShrink: 1 },
  stepDetail: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 18 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 6 },
  fill: { height: 6, borderRadius: 3 },
  remaining: { fontFamily: fontFamily.medium, fontSize: 12, marginTop: 2 },
  error: { fontFamily: fontFamily.medium, fontSize: 14 },
  primary: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  primaryText: { fontFamily: fontFamily.semiBold, fontSize: 16 },
  secondary: { height: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: fontFamily.medium, fontSize: 15 },
});
