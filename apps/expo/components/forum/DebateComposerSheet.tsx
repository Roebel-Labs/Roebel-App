import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native';
import { sendTransaction, waitForReceipt } from 'thirdweb';
import BottomDrawer from '@/components/BottomDrawer';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { gnosis } from '@/constants/gnosis';
import { client } from '@/constants/thirdweb';
import { useGnosisWallet } from '@/context/GnosisWalletContext';
import { prepareAddArgument } from '@/lib/deliberate/chain';
import { digestToBytes32, putDebateContent } from '@/lib/deliberate/content';
import { formatPunkte, utf8ByteLength, MAX_CONTENT_BYTES, MIN_DEPOSIT } from '@/lib/deliberate/protocol';

type Props = {
  visible: boolean;
  onClose: () => void;
  debateId: number;
  parentArgumentId: number;
  isSupporting: boolean;
  /** The author's current vote-token balance (hundredths) — caps the deposit. */
  maxDeposit: number;
  onCreated: () => void;
};

// The protocol only seeds approvals of 50-99 % — an author cannot open below even.
const APPROVAL_CHOICES = [50, 60, 75, 90] as const;
const DEPOSIT_CHOICES = [1000, 1500, 2000, 3000, 5000] as const;

export default function DebateComposerSheet({
  visible,
  onClose,
  debateId,
  parentArgumentId,
  isSupporting,
  maxDeposit,
  onCreated,
}: Props) {
  const { colors } = useTheme();
  const { gnosisAccount } = useGnosisWallet();
  const [text, setText] = useState('');
  const [approval, setApproval] = useState<number>(60);
  const [deposit, setDeposit] = useState<number>(MIN_DEPOSIT);
  const [submitting, setSubmitting] = useState(false);

  const bytes = utf8ByteLength(text);
  const affordable = DEPOSIT_CHOICES.filter((d) => d <= maxDeposit);
  const canSubmit =
    !!gnosisAccount && !submitting && bytes > 0 && bytes <= MAX_CONTENT_BYTES && deposit <= maxDeposit;

  const handleSubmit = async () => {
    if (!canSubmit || !gnosisAccount) return;
    setSubmitting(true);
    try {
      const digest = await putDebateContent(text.trim());
      const { transactionHash } = await sendTransaction({
        transaction: prepareAddArgument(
          debateId,
          parentArgumentId,
          digestToBytes32(digest),
          isSupporting,
          approval,
          deposit,
        ),
        account: gnosisAccount,
      });
      await waitForReceipt({ client, chain: gnosis, transactionHash });
      setText('');
      onCreated();
    } catch (e) {
      // Keep the draft — the sheet stays open with everything the author typed.
      Alert.alert('Argument nicht gespeichert', 'Bitte versuche es erneut.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BottomDrawer visible={visible} onClose={onClose}>
      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {isSupporting ? 'Argument dafür' : 'Argument dagegen'}
        </Text>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Dein Argument — kurz und überprüfbar."
          placeholderTextColor={colors.textTertiary}
          multiline
          maxLength={2000}
          style={[
            styles.input,
            { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface },
          ]}
        />
        <Text style={[styles.counter, { color: bytes > MAX_CONTENT_BYTES ? colors.error : colors.textTertiary }]}>
          {bytes} / {MAX_CONTENT_BYTES} Bytes
        </Text>

        <Text style={[styles.label, { color: colors.textSecondary }]}>
          Deine Einschätzung: Wie stark hält das Argument?
        </Text>
        <View style={styles.chipRow}>
          {APPROVAL_CHOICES.map((a) => (
            <Pressable
              key={a}
              onPress={() => setApproval(a)}
              style={[
                styles.chip,
                { borderColor: approval === a ? colors.primary : colors.border },
                approval === a && { backgroundColor: colors.primary },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: approval === a ? colors.primaryForeground : colors.textSecondary },
                ]}
              >
                {a} %
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.label, { color: colors.textSecondary }]}>
          Einsatz (startet den Bewertungsmarkt, mind. {formatPunkte(MIN_DEPOSIT)} Punkte)
        </Text>
        <View style={styles.chipRow}>
          {(affordable.length > 0 ? affordable : [MIN_DEPOSIT]).map((d) => (
            <Pressable
              key={d}
              onPress={() => setDeposit(d)}
              style={[
                styles.chip,
                { borderColor: deposit === d ? colors.primary : colors.border },
                deposit === d && { backgroundColor: colors.primary },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: deposit === d ? colors.primaryForeground : colors.textSecondary },
                ]}
              >
                {formatPunkte(d)} P.
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          onPress={() => void handleSubmit()}
          disabled={!canSubmit}
          style={[styles.submit, { backgroundColor: colors.primary, opacity: canSubmit ? 1 : 0.5 }]}
        >
          <Text style={[styles.submitText, { color: colors.primaryForeground }]}>
            {submitting ? 'Wird gespeichert …' : 'Argument einreichen'}
          </Text>
        </Pressable>
      </View>
    </BottomDrawer>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingBottom: 24, gap: 10 },
  title: { fontSize: 16, fontFamily: fontFamily.semiBold },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 96,
    padding: 12,
    fontSize: 14,
    fontFamily: fontFamily.regular,
    textAlignVertical: 'top',
  },
  counter: { fontSize: 11, fontFamily: fontFamily.regular, textAlign: 'right' },
  label: { fontSize: 12, fontFamily: fontFamily.medium, marginTop: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  chipText: { fontSize: 13, fontFamily: fontFamily.medium },
  submit: { borderRadius: 999, paddingVertical: 13, alignItems: 'center', marginTop: 10 },
  submitText: { fontSize: 15, fontFamily: fontFamily.semiBold },
});
