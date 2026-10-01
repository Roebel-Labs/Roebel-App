import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import { useTheme } from '@/context/ThemeContext';
import { useVerificationContext } from '@/context/VerificationContext';
import { fontFamily } from '@/constants/theme';
import { useGoBack } from '@/hooks/useGoBack';
import { ArrowLeftIcon } from '@/components/Icons';
import MeckyNotFound from '@/components/MeckyNotFound';
import BottomDrawer from '@/components/BottomDrawer';
import StatusChip from '@/components/vorhaben/StatusChip';
import { fetchContract, vorhabenAction, type ContractLine, type ContractView, type LineRole } from '@/lib/vorhaben';
import { formatAmount, LINE_STATUS_LABELS, ROLE_LABELS, STAGE_LABELS, type ChipTone, type LineStatus } from '@/lib/vorhaben-labels';

const TX_RE = /^0x[0-9a-fA-F]{64}$/;
const GROUPS: { role: LineRole; title: string }[] = [
  { role: 'empfaenger', title: 'Empfänger' },
  { role: 'aufgabe', title: 'Aufgaben' },
  { role: 'wahlhelfer', title: 'Wahlhelfer:innen' },
  { role: 'plattform', title: 'Plattform' },
];
const LINE_TONES: Record<LineStatus, ChipTone> = {
  geplant: 'neutral', sendend: 'info', vorgeschlagen: 'warning', gesendet: 'info',
  bestaetigt: 'success', unklar: 'warning', fehlgeschlagen: 'error',
};
const plainNumber = (n: string) => Number(n).toLocaleString('de-DE', { maximumFractionDigits: 4 });

export default function ContractScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const goBack = useGoBack();
  const account = useActiveAccount();
  const { hasAttesterNFT } = useVerificationContext();
  const { proposalId } = useLocalSearchParams<{ proposalId: string }>();

  const [view, setView] = useState<ContractView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [recording, setRecording] = useState<ContractLine | null>(null);
  const [txInput, setTxInput] = useState('');
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    if (!proposalId) return;
    try {
      setView(await fetchContract(proposalId));
      setLoadError(null);
    } catch {
      setLoadError('Verbindung fehlgeschlagen. Bitte später erneut versuchen.');
    } finally {
      setLoaded(true);
    }
  }, [proposalId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Safety net: never leave an endless spinner if the read hangs past its own deadline.
  useEffect(() => {
    if (loaded) return;
    const t = setTimeout(() => { setLoadError((e) => e ?? 'Verbindung fehlgeschlagen. Bitte später erneut versuchen.'); setLoaded(true); }, 30000);
    return () => clearTimeout(t);
  }, [loaded]);

  const closeDrawer = () => { if (!busyRef.current) setRecording(null); };
  const openRecord = (line: ContractLine) => { setTxInput(''); setDrawerError(null); setRecording(line); };

  const submitRecord = async () => {
    if (busyRef.current || !recording) return;
    const tx = txInput.trim();
    if (!TX_RE.test(tx)) { setDrawerError('Der Transaktions-Hash ist ungültig.'); return; }
    if (!account) { setDrawerError('Bitte melde dich an, um die Überweisung einzutragen.'); return; }
    busyRef.current = true;
    setBusy(true);
    setDrawerError(null);
    try {
      const r = await vorhabenAction(account, 'payout_record_manual', { lineId: recording.id, txHash: tx });
      if (!r.ok) {
        setDrawerError(r.code === 'NETWORK_ERROR' ? 'Keine Verbindung. Bitte versuche es erneut.' : r.message);
        return;
      }
      setRecording(null);
      await load();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const header = (
    <View style={[styles.header, { borderBottomColor: colors.border }]}>
      <Pressable onPress={goBack} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Zurück">
        <ArrowLeftIcon size={24} color={colors.textPrimary} />
      </Pressable>
      <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Vertrag</Text>
      <View style={styles.headerButton} />
    </View>
  );

  if (loadError && !view) {
    return <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]}>{header}<MeckyNotFound title={loadError} /></SafeAreaView>;
  }
  if (loaded && !view) {
    return <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]}>{header}<MeckyNotFound title="Vorschlag nicht gefunden" /></SafeAreaView>;
  }
  if (!view) {
    return <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]}>{header}<ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} /></SafeAreaView>;
  }

  const feePct = (view.feeBps / 100).toLocaleString('de-DE', { maximumFractionDigits: 2 });
  const totalsText = view.totals.map((t) => formatAmount(t.amount, t.asset)).join(' · ');

  const openTx = (line: ContractLine) => {
    if (!line.txHash) return;
    router.push({
      pathname: '/transaction',
      params: {
        direction: 'out', title: ROLE_LABELS[line.role], amountText: plainNumber(line.amount),
        currency: line.asset === 'MUENZEN' ? 'muenzen' : line.asset === 'XDAI' ? 'xdai' : 'eur',
        txHash: line.txHash, name: line.recipientName, context: `Teil des Vertrags zu Vorschlag #${view.proposalNumber}`,
      },
    } as any);
  };

  const renderLine = (line: ContractLine) => {
    const canRecord = hasAttesterNFT && !!account && line.role === 'empfaenger' && line.status === 'geplant' && line.rail === 'manual_safe';
    const body = (
      <View style={styles.rowTop}>
        <View style={styles.flex}>
          <Text style={[styles.rowName, { color: colors.textPrimary }]} numberOfLines={1}>{line.recipientName}</Text>
          <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={2}>für: {line.purpose}</Text>
        </View>
        <View style={styles.rowRight}>
          <Text style={[styles.rowAmount, { color: colors.textPrimary }]}>{formatAmount(line.amount, line.asset)}</Text>
          <StatusChip label={LINE_STATUS_LABELS[line.status] ?? line.status} tone={LINE_TONES[line.status] ?? 'neutral'} />
        </View>
      </View>
    );
    return (
      <View key={line.id} style={[styles.row, { borderColor: colors.border, backgroundColor: colors.card }]}>
        {line.txHash ? (
          <Pressable onPress={() => openTx(line)} accessibilityRole="button" accessibilityLabel={`Transaktion an ${line.recipientName} ansehen`}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
            {body}
          </Pressable>
        ) : body}
        {canRecord && (
          <Pressable onPress={() => openRecord(line)} accessibilityRole="button"
            style={({ pressed }) => [styles.secondary, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
            <Text style={[styles.secondaryText, { color: colors.textPrimary }]}>Überweisung eintragen</Text>
          </Pressable>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {header}
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={[styles.head, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Pressable onPress={() => router.push(`/proposal/${view.proposalKey}` as any)} accessibilityRole="link">
              <Text style={[styles.link, { color: colors.primary }]}>Vorschlag #{view.proposalNumber}</Text>
            </Pressable>
            <Text style={[styles.title, { color: colors.textPrimary }]}>{view.title}</Text>
            <StatusChip label={STAGE_LABELS[view.stage] ?? view.stage} tone={view.stage === 'abgelehnt' ? 'error' : 'info'} />
            <Text style={[styles.meta, { color: colors.textSecondary }]}>Plattformanteil: {feePct} % zusätzlich</Text>
            {!!totalsText && <Text style={[styles.total, { color: colors.textPrimary }]}>{totalsText}</Text>}
          </View>

          {loadError && (
            <View style={[styles.banner, { backgroundColor: colors.errorBackground }]}>
              <Text style={[styles.meta, { color: colors.error }]}>{loadError} Angezeigt wird der letzte Stand.</Text>
            </View>
          )}

          {view.lines.length === 0 ? (
            <Text style={[styles.meta, { color: colors.textSecondary }]}>Noch keine Auszahlungen.</Text>
          ) : GROUPS.map((g) => {
            const lines = view.lines.filter((l) => l.role === g.role);
            if (lines.length === 0) return null;
            return (
              <View key={g.role} style={styles.group}>
                <Text style={[styles.groupTitle, { color: colors.textPrimary }]}>{g.title}</Text>
                {lines.map(renderLine)}
              </View>
            );
          })}
        </ScrollView>
      </KeyboardAvoidingView>

      <BottomDrawer visible={!!recording} onClose={closeDrawer}>
        <View style={styles.drawer}>
          <Text style={[styles.drawerTitle, { color: colors.textPrimary }]}>Überweisung eintragen</Text>
          {recording && (
            <Text style={[styles.meta, { color: colors.textSecondary }]}>
              {formatAmount(recording.amount, recording.asset)} an {recording.recipientName}
            </Text>
          )}
          <TextInput value={txInput} onChangeText={setTxInput} placeholder="Transaktions-Hash (0x…)" placeholderTextColor={colors.textTertiary}
            maxLength={66} autoCapitalize="none" autoCorrect={false}
            style={[styles.textField, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]} />
          {drawerError && <Text style={[styles.error, { color: colors.error }]}>{drawerError}</Text>}
          <Pressable disabled={busy || !txInput.trim()} onPress={submitRecord} accessibilityRole="button"
            style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary, opacity: busy || !txInput.trim() ? 0.5 : pressed ? 0.85 : 1 }]}>
            {busy ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={[styles.primaryText, { color: colors.onPrimary }]}>Eintragen</Text>}
          </Pressable>
        </View>
      </BottomDrawer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, height: 52, borderBottomWidth: StyleSheet.hairlineWidth },
  headerButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: fontFamily.semiBold, fontSize: 17 },
  content: { padding: 20, gap: 16, paddingBottom: 40 },
  head: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 8 },
  link: { fontFamily: fontFamily.medium, fontSize: 13 },
  title: { fontFamily: fontFamily.heading, fontSize: 20, lineHeight: 26 },
  total: { fontFamily: fontFamily.semiBold, fontSize: 15, lineHeight: 21 },
  meta: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 18 },
  banner: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  group: { gap: 8 },
  groupTitle: { fontFamily: fontFamily.semiBold, fontSize: 16 },
  row: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 10 },
  rowTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  rowName: { fontFamily: fontFamily.semiBold, fontSize: 14 },
  rowRight: { alignItems: 'flex-end', gap: 6, flexShrink: 0 },
  rowAmount: { fontFamily: fontFamily.semiBold, fontSize: 14 },
  secondary: { height: 42, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  secondaryText: { fontFamily: fontFamily.medium, fontSize: 14 },
  drawer: { paddingHorizontal: 20, paddingBottom: 12, gap: 12 },
  drawerTitle: { fontFamily: fontFamily.semiBold, fontSize: 18 },
  textField: { height: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontFamily: fontFamily.regular, fontSize: 14 },
  error: { fontFamily: fontFamily.medium, fontSize: 14 },
  primary: { height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryText: { fontFamily: fontFamily.semiBold, fontSize: 16 },
});
