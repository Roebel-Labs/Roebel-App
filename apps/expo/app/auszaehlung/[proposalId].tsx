import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { useGoBack } from '@/hooks/useGoBack';
import { ArrowLeftIcon } from '@/components/Icons';
import MeckyNotFound from '@/components/MeckyNotFound';
import { fetchTallyView, resolveProposalUuid, submitTally, type TallyView } from '@/lib/vorhaben';
import { formatAmount, timeLeft } from '@/lib/vorhaben-labels';

export default function TallyConfirmScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const goBack = useGoBack();
  const account = useActiveAccount();
  const { proposalId: proposalKey } = useLocalSearchParams<{ proposalId: string }>();
  const [uuid, setUuid] = useState<string | null>(null);
  const [view, setView] = useState<TallyView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [noAccount, setNoAccount] = useState(false);
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    if (!proposalKey || !account) return;
    setError(null);
    try {
      const id = await resolveProposalUuid(proposalKey);
      if (!id) { setError('Vorschlag nicht gefunden'); return; }
      setUuid(id);
      const r = await fetchTallyView(id, account.address);
      if (r.ok) setView(r.data); else setError(r.message);
    } catch {
      setError('Verbindung fehlgeschlagen. Bitte später erneut versuchen.');
    }
  }, [proposalKey, account]);

  useEffect(() => { load(); }, [load]);

  // No account after a short grace period (logged out, or wallet still connecting).
  useEffect(() => {
    if (account) { setNoAccount(false); return; }
    const t = setTimeout(() => setNoAccount(true), 4000);
    return () => clearTimeout(t);
  }, [account]);

  const confirm = async () => {
    if (busyRef.current || !account || !uuid || !view) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const r = await submitTally(account, uuid, view.message);
      if (r.ok) { setDone(true); return; }
      if (r.code === 'NETWORK_ERROR') setError('Keine Verbindung. Bitte versuche es erneut.');
      else if (r.code === 'SIGN_FAILED') setError('Signatur abgebrochen oder fehlgeschlagen.');
      else setError(r.message);
      if (r.code === 'ALREADY_CONFIRMED' || r.code === 'WINDOW_CLOSED') await load();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const header = (
    <View style={[styles.header, { borderBottomColor: colors.border }]}>
      <Pressable onPress={goBack} style={styles.back} accessibilityRole="button" accessibilityLabel="Zurück">
        <ArrowLeftIcon size={24} color={colors.textPrimary} />
      </Pressable>
      <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Auszählung bestätigen</Text>
      <View style={{ width: 40 }} />
    </View>
  );

  if (error && !view) {
    return <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]}>{header}<MeckyNotFound title={error} /></SafeAreaView>;
  }
  if (!view && !account && noAccount) {
    return <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]}>{header}<Text style={[styles.body, { color: colors.textSecondary, padding: 20 }]}>Bitte melde dich an, um die Auszählung zu bestätigen.</Text></SafeAreaView>;
  }
  if (!view) {
    return <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]}>{header}<ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} /></SafeAreaView>;
  }

  const confirmed = done || !!view.confirmedAt;
  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]}>
      {header}
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.kicker, { color: colors.textSecondary }]}>Vorschlag #{view.proposalNumber}</Text>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{view.title}</Text>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {[['Ja', view.forVotes], ['Nein', view.againstVotes], ['Enthaltung', view.abstainVotes]].map(([label, value]) => (
            <View key={label} style={styles.row}>
              <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>{label}</Text>
              <Text style={[styles.rowValue, { color: colors.textPrimary }]}>{value}</Text>
            </View>
          ))}
        </View>

        {!view.eligible ? (
          <>
            <Text style={[styles.body, { color: colors.textSecondary }]}>Du bist für diese Auszählung nicht als Wahlhelfer:in eingetragen.</Text>
            <Pressable style={[styles.secondary, { borderColor: colors.border }]} onPress={() => router.replace(`/proposal/${proposalKey}` as any)}>
              <Text style={[styles.secondaryText, { color: colors.textPrimary }]}>Zum Vorschlag</Text>
            </Pressable>
          </>
        ) : confirmed ? (
          <>
            <Text style={[styles.success, { color: colors.success }]}>
              {done ? `Danke, Wahlhelfer:in. Deine ${formatAmount(view.reward.amount, view.reward.asset)} werden dir in Kürze überwiesen.` : 'Danke, du hast das Ergebnis bestätigt.'}
            </Text>
            <Pressable style={[styles.secondary, { borderColor: colors.border }]} onPress={() => router.replace(`/vertrag/${proposalKey}` as any)}>
              <Text style={[styles.secondaryText, { color: colors.textPrimary }]}>Zum Vertrag</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={[styles.body, { color: colors.textSecondary }]}>Frist: {timeLeft(view.until, Date.now())}</Text>
            <View style={[styles.quote, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}>
              <Text style={[styles.quoteHead, { color: colors.textSecondary }]}>Du unterschreibst:</Text>
              <Text selectable style={[styles.quoteText, { color: colors.textPrimary }]}>{view.message}</Text>
            </View>
            <Text style={[styles.body, { color: colors.textSecondary }]}>
              Als Dank erhältst du {formatAmount(view.reward.amount, view.reward.asset)}.
            </Text>
            {error && <Text style={[styles.error, { color: colors.error }]}>{error}</Text>}
            <Pressable disabled={busy} onPress={confirm}
              style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary, opacity: busy ? 0.6 : pressed ? 0.85 : 1 }]}
              accessibilityRole="button">
              {busy ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={[styles.primaryText, { color: colors.onPrimary }]}>Bestätigen und signieren</Text>}
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, height: 52, borderBottomWidth: StyleSheet.hairlineWidth },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: fontFamily.semiBold, fontSize: 17 },
  content: { padding: 20, gap: 16, paddingBottom: 60 },
  kicker: { fontFamily: fontFamily.medium, fontSize: 13 },
  title: { fontFamily: fontFamily.heading, fontSize: 22, lineHeight: 28 },
  card: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  rowLabel: { fontFamily: fontFamily.regular, fontSize: 15 },
  rowValue: { fontFamily: fontFamily.semiBold, fontSize: 15 },
  body: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 21 },
  quote: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 6 },
  quoteHead: { fontFamily: fontFamily.medium, fontSize: 12 },
  quoteText: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20 },
  error: { fontFamily: fontFamily.medium, fontSize: 14 },
  success: { fontFamily: fontFamily.semiBold, fontSize: 16, lineHeight: 22 },
  primary: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: fontFamily.semiBold, fontSize: 16 },
  secondary: { height: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: fontFamily.medium, fontSize: 15 },
});
