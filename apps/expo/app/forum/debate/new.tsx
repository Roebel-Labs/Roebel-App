import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { sendTransaction, waitForReceipt } from 'thirdweb';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { gnosis } from '@/constants/gnosis';
import { client } from '@/constants/thirdweb';
import {
  DEFAULT_FEE_PERCENT,
  DURATION_PRESETS,
  OPEN_REGISTRY_ZERO,
  ROEBEL_DEBATE_REGISTRY,
} from '@/constants/deliberate';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import { useUser } from '@/context/UserContext';
import { useGnosisWallet } from '@/context/GnosisWalletContext';
import {
  extractDebateIdFromReceipt,
  prepareCreateDebate,
  readDebatesCount,
} from '@/lib/deliberate/chain';
import { digestToBytes32, putDebateContent } from '@/lib/deliberate/content';
import { utf8ByteLength, MAX_CONTENT_BYTES } from '@/lib/deliberate/protocol';
import { attachDebateToThread, fetchForumThread } from '@/lib/supabase-forum';

export default function NewDebateScreen() {
  const { thread: threadId } = useLocalSearchParams<{ thread: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isCitizen } = useUser();
  const { gnosisAccount } = useGnosisWallet();

  const [thesis, setThesis] = useState('');
  const [presetKey, setPresetKey] = useState<string>('standard');
  const [membersOnly, setMembersOnly] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const prefilled = useRef(false);

  const { data: thread } = useQuery({
    queryKey: ['forum', 'thread', threadId],
    queryFn: () => fetchForumThread(threadId!),
    enabled: !!threadId,
  });

  useEffect(() => {
    if (thread && !prefilled.current) {
      prefilled.current = true;
      setThesis(thread.title);
    }
  }, [thread]);

  const bytes = utf8ByteLength(thesis);
  const preset = DURATION_PRESETS.find((p) => p.key === presetKey) ?? DURATION_PRESETS[0];
  const isOwner =
    !!user?.wallet_address &&
    !!thread?.wallet_address &&
    user.wallet_address.toLowerCase() === thread.wallet_address.toLowerCase();
  const canSubmit =
    !!gnosisAccount && !submitting && isCitizen && isOwner && bytes > 0 && bytes <= MAX_CONTENT_BYTES;

  const handleSubmit = async () => {
    if (!canSubmit || !gnosisAccount || !thread || !user?.wallet_address) return;
    setSubmitting(true);
    try {
      const digest = await putDebateContent(thesis.trim());
      const { transactionHash } = await sendTransaction({
        transaction: prepareCreateDebate(
          digestToBytes32(digest),
          preset.locking,
          preset.editing,
          preset.rating,
          DEFAULT_FEE_PERCENT,
          membersOnly ? ROEBEL_DEBATE_REGISTRY : OPEN_REGISTRY_ZERO,
        ),
        account: gnosisAccount,
      });
      const receipt = await waitForReceipt({ client, chain: gnosis, transactionHash });
      let debateId = extractDebateIdFromReceipt(receipt);
      if (debateId == null) {
        debateId = (await readDebatesCount()) - 1;
      }
      await attachDebateToThread(thread.id, user.wallet_address, debateId);
      await queryClient.invalidateQueries({ queryKey: ['forum', 'thread', thread.id] });
      router.replace(`/forum/debate/${debateId}` as any);
    } catch (e) {
      Alert.alert(
        'Debatte nicht gestartet',
        'Die Debatte konnte nicht angelegt werden. Bitte versuche es erneut.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Strukturierte Debatte</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          Die These wird unveränderlich auf der Gnosis Chain verankert. Teilnehmende bauen darunter
          einen Argumentbaum und schätzen die Argumente ein — das Ergebnis ist ein Meinungsbild.
        </Text>

        <Text style={[styles.label, { color: colors.textSecondary }]}>These</Text>
        <TextInput
          value={thesis}
          onChangeText={setThesis}
          multiline
          maxLength={1200}
          placeholder="Eine klare, entscheidbare Aussage."
          placeholderTextColor={colors.textTertiary}
          style={[
            styles.input,
            { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface },
          ]}
        />
        <Text style={[styles.counter, { color: bytes > MAX_CONTENT_BYTES ? colors.error : colors.textTertiary }]}>
          {bytes} / {MAX_CONTENT_BYTES} Bytes
        </Text>

        <Text style={[styles.label, { color: colors.textSecondary }]}>Zeitplan</Text>
        {DURATION_PRESETS.map((p) => (
          <Pressable
            key={p.key}
            onPress={() => setPresetKey(p.key)}
            style={[
              styles.presetRow,
              { borderColor: presetKey === p.key ? colors.primary : colors.border },
            ]}
          >
            <Text
              style={[
                styles.presetText,
                { color: presetKey === p.key ? colors.primary : colors.textSecondary },
              ]}
            >
              {p.label}
            </Text>
          </Pressable>
        ))}

        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.switchTitle, { color: colors.textPrimary }]}>Nur Münzen-Mitglieder</Text>
            <Text style={[styles.switchHint, { color: colors.textTertiary }]}>
              Teilnahme nur für Mitglieder der Röbel Münzen Gemeinschaft.
            </Text>
          </View>
          <Switch value={membersOnly} onValueChange={setMembersOnly} trackColor={{ true: colors.primary }} />
        </View>

        {!isOwner && thread ? (
          <Text style={[styles.warn, { color: colors.error }]}>
            Nur wer das Thema erstellt hat, kann die Debatte dazu starten.
          </Text>
        ) : null}

        <Pressable
          onPress={() => void handleSubmit()}
          disabled={!canSubmit}
          style={[styles.submit, { backgroundColor: colors.primary, opacity: canSubmit ? 1 : 0.5 }]}
        >
          <Text style={[styles.submitText, { color: colors.primaryForeground }]}>
            {submitting ? 'Debatte wird angelegt …' : 'Debatte starten'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: { fontSize: 16, fontFamily: fontFamily.semiBold },
  content: { paddingHorizontal: 16, paddingBottom: 40, gap: 10 },
  hint: { fontSize: 13, fontFamily: fontFamily.regular, lineHeight: 18 },
  label: { fontSize: 12, fontFamily: fontFamily.medium, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 80,
    padding: 12,
    fontSize: 15,
    fontFamily: fontFamily.regular,
    textAlignVertical: 'top',
  },
  counter: { fontSize: 11, fontFamily: fontFamily.regular, textAlign: 'right' },
  presetRow: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  presetText: { fontSize: 13, fontFamily: fontFamily.medium },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  switchTitle: { fontSize: 14, fontFamily: fontFamily.medium },
  switchHint: { fontSize: 12, fontFamily: fontFamily.regular, marginTop: 2 },
  warn: { fontSize: 12, fontFamily: fontFamily.regular },
  submit: { borderRadius: 999, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  submitText: { fontSize: 15, fontFamily: fontFamily.semiBold },
});
