import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
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
import {
  formatAmount, LINE_STATUS_LABELS, paidProofText, payoutErrorText, ROLE_LABELS, STAGE_LABELS, type ChipTone, type LineStatus,
} from '@/lib/vorhaben-labels';
import { uploadMediaFile } from '@/lib/upload-media';

const TX_RE = /^0x[0-9a-fA-F]{64}$/;
const UPLOAD_TIMEOUT_MS = 60000;
type RecordMode = 'manual' | 'card';

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}
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
  const [mode, setMode] = useState<RecordMode>('manual');
  const [txInput, setTxInput] = useState('');
  const [receipt, setReceipt] = useState<{ url: string; label: string } | null>(null);
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);
  const uploadingRef = useRef(false);
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

  const closeDrawer = () => { if (!busyRef.current && !uploadingRef.current) setRecording(null); };
  const openRecord = (line: ContractLine, m: RecordMode) => {
    setMode(m); setTxInput(''); setReceipt(null); setNote(''); setDrawerError(null); setRecording(line);
  };

  // Receipt photo of a card payment: same upload as the task proof photos (public URL in the images bucket).
  const pickReceipt = async () => {
    if (uploadingRef.current || !account) return;
    let res: ImagePicker.ImagePickerResult;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { setDrawerError('Bitte erlaube den Zugriff auf deine Fotos.'); return; }
      res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    } catch {
      setDrawerError('Die Fotoauswahl konnte nicht geöffnet werden.');
      return;
    }
    if (res.canceled || !res.assets[0]) return;
    uploadingRef.current = true;
    setUploading(true);
    setDrawerError(null);
    try {
      const asset = res.assets[0];
      const url = await withTimeout(uploadMediaFile(asset.uri, account.address, 'image', 'vorhaben', asset.mimeType ?? undefined), UPLOAD_TIMEOUT_MS);
      if (!url) { setDrawerError('Beleg konnte nicht hochgeladen werden.'); return; }
      setReceipt({ url, label: asset.fileName ?? 'Beleg' });
    } catch {
      setDrawerError('Beleg konnte nicht hochgeladen werden.');
    } finally {
      uploadingRef.current = false;
      setUploading(false);
    }
  };

  // Legacy wallet-signed requests (no ctx): the payout_record_* actions are not person-signable.
  const submitRecord = async () => {
    if (busyRef.current || uploadingRef.current || !recording) return;
    const tx = txInput.trim();
    if (!TX_RE.test(tx)) { setDrawerError('Der Transaktions-Hash ist ungültig (0x und 64 Zeichen).'); return; }
    if (mode === 'card' && !receipt) { setDrawerError('Bitte lade den Beleg der Kartenzahlung hoch.'); return; }
    if (!account) { setDrawerError('Bitte melde dich an, um die Auszahlung einzutragen.'); return; }
    busyRef.current = true;
    setBusy(true);
    setDrawerError(null);
    try {
      const r = mode === 'card'
        ? await vorhabenAction(account, 'payout_record_card',
          { lineId: recording.id, txHash: tx, proofUrl: receipt!.url, ...(note.trim() ? { note: note.trim() } : {}) })
        : await vorhabenAction(account, 'payout_record_manual', { lineId: recording.id, txHash: tx });
      if (!r.ok) {
        setDrawerError(payoutErrorText(r));
        // A timed-out request may still have been recorded: refresh the lines behind the drawer.
        if (['NETWORK_ERROR', 'BAD_STATUS', 'CONFLICT'].includes(r.code)) await load();
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
    // Manually paid lines: the budget, and a task reward + its platform fee (task payouts are paid by hand for now).
    const manualRole = line.role === 'empfaenger' || line.role === 'aufgabe' || (line.role === 'plattform' && line.referenceType === 'task');
    const canRecord = hasAttesterNFT && !!account && manualRole && line.status === 'geplant' && line.rail === 'manual_safe';
    // The budget may also have been paid with the operator's card after a top-up from the Gemeinschaftskasse.
    const canRecordCard = canRecord && line.role === 'empfaenger';
    const proof = paidProofText(line);
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
        {(proof || line.proofUrl) && (
          <View style={styles.proofRow}>
            {proof && <Text style={[styles.meta, { color: colors.textSecondary }]}>{proof}</Text>}
            {line.proofUrl && (
              <Pressable onPress={() => { Linking.openURL(line.proofUrl!).catch(() => {}); }} accessibilityRole="link" hitSlop={8}>
                <Text style={[styles.proofLink, { color: colors.primary }]}>Beleg ansehen</Text>
              </Pressable>
            )}
          </View>
        )}
        {canRecord && (
          <Pressable onPress={() => openRecord(line, 'manual')} accessibilityRole="button"
            style={({ pressed }) => [styles.secondary, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
            <Text style={[styles.secondaryText, { color: colors.textPrimary }]}>Überweisung eintragen</Text>
          </Pressable>
        )}
        {canRecordCard && (
          <Pressable onPress={() => openRecord(line, 'card')} accessibilityRole="button"
            style={({ pressed }) => [styles.secondary, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
            <Text style={[styles.secondaryText, { color: colors.textPrimary }]}>Kartenzahlung eintragen</Text>
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

      <BottomDrawer visible={!!recording} onClose={closeDrawer} keyboardAware>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.drawer}>
          <Text style={[styles.drawerTitle, { color: colors.textPrimary }]}>
            {mode === 'card' ? 'Kartenzahlung eintragen' : 'Überweisung eintragen'}
          </Text>
          {recording && (
            <Text style={[styles.meta, { color: colors.textSecondary }]}>
              {formatAmount(recording.amount, recording.asset)} an {recording.recipientName}
            </Text>
          )}
          <Text style={[styles.meta, { color: colors.textSecondary }]}>
            {mode === 'card'
              ? 'Die Spende wurde mit der Karte bezahlt, nachdem die Gemeinschaftskasse die Karte aufgeladen hat. '
                + 'Trage den Hash dieser Aufladung ein (xDAI oder EURe, mindestens der Betrag; 1 xDAI = 1 €) und lade den Beleg hoch.'
              : 'Die Auszahlung kann in xDAI oder EURe aus der Gemeinschaftskasse erfolgen (1 xDAI = 1 €). '
                + 'Füge den Transaktions-Hash ein; wir prüfen die Überweisung auf der Blockchain.'}
          </Text>
          <TextInput value={txInput} onChangeText={setTxInput}
            placeholder={mode === 'card' ? 'Transaktions-Hash der Kartenaufladung (0x…)' : 'Transaktions-Hash (0x…)'}
            placeholderTextColor={colors.textTertiary} maxLength={66} autoCapitalize="none" autoCorrect={false}
            style={[styles.textField, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]} />
          {mode === 'card' && (
            <>
              <Pressable disabled={uploading || busy} onPress={pickReceipt} accessibilityRole="button"
                style={({ pressed }) => [styles.secondary, { borderColor: colors.border, opacity: uploading || busy ? 0.5 : pressed ? 0.7 : 1 }]}>
                {uploading ? <ActivityIndicator color={colors.primary} />
                  : <Text style={[styles.secondaryText, { color: colors.textPrimary }]} numberOfLines={1}>
                    {receipt ? `Beleg: ${receipt.label} (ersetzen)` : 'Beleg hochladen'}
                  </Text>}
              </Pressable>
              <TextInput value={note} onChangeText={setNote} placeholder="Notiz (optional)" placeholderTextColor={colors.textTertiary}
                maxLength={1000} multiline
                style={[styles.textArea, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]} />
            </>
          )}
          {drawerError && <Text style={[styles.error, { color: colors.error }]}>{drawerError}</Text>}
          {(() => {
            const disabled = busy || uploading || !txInput.trim() || (mode === 'card' && !receipt);
            return (
              <Pressable disabled={disabled} onPress={submitRecord} accessibilityRole="button"
                style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }]}>
                {busy ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={[styles.primaryText, { color: colors.onPrimary }]}>Eintragen</Text>}
              </Pressable>
            );
          })()}
        </ScrollView>
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
  textArea: { minHeight: 72, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontFamily: fontFamily.regular, fontSize: 14, textAlignVertical: 'top' },
  proofRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 10, rowGap: 4 },
  proofLink: { fontFamily: fontFamily.medium, fontSize: 13 },
  error: { fontFamily: fontFamily.medium, fontSize: 14 },
  primary: { height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryText: { fontFamily: fontFamily.semiBold, fontSize: 16 },
});
