import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import { randomUUID } from 'expo-crypto';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { useGoBack } from '@/hooks/useGoBack';
import { ArrowLeftIcon } from '@/components/Icons';
import { resolveProposalForTask, vorhabenAction } from '@/lib/vorhaben';
import { parseEuroInput } from '@/lib/vorhaben-labels';

type Deadline = 'week' | 'two_weeks' | 'none';
const DEADLINES: { key: Deadline; label: string; days: number | null }[] = [
  { key: 'week', label: '1 Woche', days: 7 },
  { key: 'two_weeks', label: '2 Wochen', days: 14 },
  { key: 'none', label: 'Keine', days: null },
];
const MAX_CRITERIA = 10;

export default function NewTaskScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const goBack = useGoBack();
  const account = useActiveAccount();
  const { proposalKey } = useLocalSearchParams<{ proposalKey: string }>();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [criteria, setCriteria] = useState<string[]>(['']);
  const [reward, setReward] = useState('');
  const [deadline, setDeadline] = useState<Deadline>('none');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  // One id per form: a retry after a lost response hits CONFLICT instead of creating a second task.
  const taskIdRef = useRef(randomUUID());
  const [noAccount, setNoAccount] = useState(false);

  useEffect(() => {
    if (account) { setNoAccount(false); return; }
    const t = setTimeout(() => setNoAccount(true), 4000);
    return () => clearTimeout(t);
  }, [account]);

  const submit = async () => {
    if (busyRef.current || !account) return;
    const t = title.trim();
    const crit = criteria.map((c) => c.trim()).filter(Boolean);
    const amount = parseEuroInput(reward);
    if (!proposalKey) { setError('Vorschlag fehlt.'); return; }
    if (t.length < 3 || t.length > 140) { setError('Der Titel muss 3 bis 140 Zeichen lang sein.'); return; }
    if (crit.length < 1) { setError('Bitte gib mindestens ein Abnahmekriterium an.'); return; }
    if (!amount) { setError('Bitte gib eine gültige Vergütung in € an (höchstens 2 Nachkommastellen).'); return; }
    const days = DEADLINES.find((d) => d.key === deadline)?.days ?? null;

    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      let proposal: { id: string; proposer: string } | null;
      try {
        proposal = await resolveProposalForTask(proposalKey);
      } catch {
        setError('Verbindung fehlgeschlagen. Bitte später erneut versuchen.');
        return;
      }
      if (!proposal) { setError('Vorschlag nicht gefunden.'); return; }
      const proposalId = proposal.id;
      const payload: Record<string, unknown> = {
        proposalId, taskId: taskIdRef.current, title: t, description: description.trim(), criteria: crit, rewardAmount: amount, rewardAsset: 'EURe',
      };
      if (days) payload.deadline = new Date(Date.now() + days * 86_400_000).toISOString();
      const role = account.address.toLowerCase() === proposal.proposer ? 'proposer' : 'attester';
      const r = await vorhabenAction(account, 'task_create', payload, { proposalKey, role });
      // CONFLICT on our own id: an earlier attempt already created the task.
      if (!r.ok && r.code === 'CONFLICT') { router.replace(`/aufgabe/${taskIdRef.current}` as any); return; }
      if (!r.ok) {
        setError(r.code === 'NETWORK_ERROR' ? 'Keine Verbindung. Bitte versuche es erneut.' : r.message);
        return;
      }
      if (r.data.id) router.replace(`/aufgabe/${r.data.id}` as any);
      else goBack();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const inputStyle = { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surfaceSecondary };

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={goBack} style={styles.back} accessibilityRole="button" accessibilityLabel="Zurück">
          <ArrowLeftIcon size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Neue Aufgabe</Text>
        <View style={{ width: 40 }} />
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={[styles.label, { color: colors.textPrimary }]}>Titel</Text>
          <TextInput value={title} onChangeText={setTitle} maxLength={140} placeholder="Was soll erledigt werden?"
            placeholderTextColor={colors.textTertiary} style={[styles.field, inputStyle]} />

          <Text style={[styles.label, { color: colors.textPrimary }]}>Beschreibung</Text>
          <TextInput value={description} onChangeText={setDescription} maxLength={4000} multiline
            placeholder="Worum geht es genau?" placeholderTextColor={colors.textTertiary} style={[styles.area, inputStyle]} />

          <Text style={[styles.label, { color: colors.textPrimary }]}>Abnahmekriterien</Text>
          {criteria.map((c, i) => (
            <View key={i} style={styles.criterionRow}>
              <TextInput value={c} maxLength={200} placeholder={`Kriterium ${i + 1}`} placeholderTextColor={colors.textTertiary}
                onChangeText={(v) => setCriteria((list) => list.map((x, j) => (j === i ? v : x)))}
                style={[styles.field, styles.flex, inputStyle]} />
              {criteria.length > 1 && (
                <Pressable onPress={() => setCriteria((list) => list.filter((_, j) => j !== i))} hitSlop={8}
                  accessibilityRole="button" accessibilityLabel={`Kriterium ${i + 1} entfernen`} style={styles.remove}>
                  <Text style={[styles.removeText, { color: colors.textSecondary }]}>✕</Text>
                </Pressable>
              )}
            </View>
          ))}
          {criteria.length < MAX_CRITERIA && (
            <Pressable onPress={() => setCriteria((list) => [...list, ''])} accessibilityRole="button" style={styles.addCriterion}>
              <Text style={[styles.addText, { color: colors.primary }]}>+ Kriterium</Text>
            </Pressable>
          )}

          <Text style={[styles.label, { color: colors.textPrimary }]}>Vergütung in €</Text>
          <TextInput value={reward} onChangeText={setReward} keyboardType="decimal-pad" placeholder="z. B. 25,00"
            placeholderTextColor={colors.textTertiary} style={[styles.field, inputStyle]} />

          <Text style={[styles.label, { color: colors.textPrimary }]}>Frist</Text>
          <View style={styles.chips}>
            {DEADLINES.map((d) => {
              const active = d.key === deadline;
              return (
                <Pressable key={d.key} onPress={() => setDeadline(d.key)} accessibilityRole="button" accessibilityState={{ selected: active }}
                  style={[styles.chip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : 'transparent' }]}>
                  <Text style={[styles.chipText, { color: active ? colors.onPrimary : colors.textPrimary }]}>{d.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {!account && noAccount && (
            <Text style={[styles.hint, { color: colors.textSecondary }]}>Bitte melde dich an, um eine Aufgabe anzulegen.</Text>
          )}
          {error && <Text style={[styles.error, { color: colors.error }]}>{error}</Text>}
          <Pressable disabled={busy || !account} onPress={submit} accessibilityRole="button"
            style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary, opacity: busy || !account ? 0.6 : pressed ? 0.85 : 1 }]}>
            {busy ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={[styles.primaryText, { color: colors.onPrimary }]}>Aufgabe anlegen</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, height: 52, borderBottomWidth: StyleSheet.hairlineWidth },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: fontFamily.semiBold, fontSize: 17 },
  content: { padding: 20, gap: 10, paddingBottom: 60 },
  label: { fontFamily: fontFamily.semiBold, fontSize: 15, marginTop: 8 },
  field: { height: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontFamily: fontFamily.regular, fontSize: 15 },
  area: { minHeight: 110, borderWidth: 1, borderRadius: 12, padding: 12, fontFamily: fontFamily.regular, fontSize: 15, textAlignVertical: 'top' },
  criterionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  remove: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  removeText: { fontSize: 16 },
  addCriterion: { alignSelf: 'flex-start', paddingVertical: 4 },
  addText: { fontFamily: fontFamily.semiBold, fontSize: 14 },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { fontFamily: fontFamily.medium, fontSize: 14 },
  hint: { fontFamily: fontFamily.regular, fontSize: 14 },
  error: { fontFamily: fontFamily.medium, fontSize: 14 },
  primary: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  primaryText: { fontFamily: fontFamily.semiBold, fontSize: 16 },
});
