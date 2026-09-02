import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { sendTransaction, waitForReceipt } from 'thirdweb';
import BottomDrawer from '@/components/BottomDrawer';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { gnosis } from '@/constants/gnosis';
import { client } from '@/constants/thirdweb';
import { useGnosisWallet } from '@/context/GnosisWalletContext';
import { prepareStake, quoteStake } from '@/lib/deliberate/chain';
import {
  approvalPercent,
  formatPunkte,
  type DebateArgumentNode,
} from '@/lib/deliberate/protocol';

type Props = {
  visible: boolean;
  onClose: () => void;
  debateId: number;
  argument: DebateArgumentNode;
  argumentText: string;
  /** The rater's current vote-token balance (hundredths) — caps the stake. */
  maxAmount: number;
  onStaked: () => void;
};

const AMOUNT_CHOICES = [200, 500, 1000, 2000] as const;

export default function DebateStakeSheet({
  visible,
  onClose,
  debateId,
  argument,
  argumentText,
  maxAmount,
  onStaked,
}: Props) {
  const { colors } = useTheme();
  const { gnosisAccount } = useGnosisWallet();
  const [isPro, setIsPro] = useState(true);
  const [amount, setAmount] = useState<number>(500);
  const [quote, setQuote] = useState<{ fee: number; sharesOut: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const affordable = AMOUNT_CHOICES.filter((a) => a <= maxAmount);
  const canSubmit = !!gnosisAccount && !submitting && amount <= maxAmount && amount > 0;

  useEffect(() => {
    let cancelled = false;
    setQuote(null);
    const t = setTimeout(async () => {
      try {
        const q = await quoteStake(debateId, argument.id, isPro, amount);
        if (!cancelled) setQuote(q);
      } catch {
        if (!cancelled) setQuote(null);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [debateId, argument.id, isPro, amount]);

  const handleSubmit = async () => {
    if (!canSubmit || !gnosisAccount) return;
    setSubmitting(true);
    try {
      const { transactionHash } = await sendTransaction({
        transaction: prepareStake(debateId, argument.id, isPro, amount),
        account: gnosisAccount,
      });
      await waitForReceipt({ client, chain: gnosis, transactionHash });
      onStaked();
    } catch {
      Alert.alert('Einschätzung nicht gespeichert', 'Bitte versuche es erneut.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BottomDrawer visible={visible} onClose={onClose}>
      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Argument einschätzen</Text>
        <Text style={[styles.excerpt, { color: colors.textSecondary }]} numberOfLines={3}>
          „{argumentText}“
        </Text>
        <Text style={[styles.meta, { color: colors.textSecondary }]}>
          Aktuelle Zustimmung: {approvalPercent(argument.pro, argument.con)} %
        </Text>

        <View style={styles.toggleRow}>
          <Pressable
            onPress={() => setIsPro(true)}
            style={[
              styles.toggle,
              { borderColor: isPro ? colors.primary : colors.border },
              isPro && { backgroundColor: colors.primary },
            ]}
          >
            <Text style={[styles.toggleText, { color: isPro ? colors.primaryForeground : colors.textSecondary }]}>
              Hält (unterbewertet)
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setIsPro(false)}
            style={[
              styles.toggle,
              { borderColor: !isPro ? colors.error : colors.border },
              !isPro && { backgroundColor: colors.error },
            ]}
          >
            <Text style={[styles.toggleText, { color: !isPro ? '#fff' : colors.textSecondary }]}>
              Hält nicht (überbewertet)
            </Text>
          </Pressable>
        </View>

        <Text style={[styles.label, { color: colors.textSecondary }]}>Einsatz</Text>
        <View style={styles.chipRow}>
          {(affordable.length > 0 ? affordable : []).map((a) => (
            <Pressable
              key={a}
              onPress={() => setAmount(a)}
              style={[
                styles.chip,
                { borderColor: amount === a ? colors.primary : colors.border },
                amount === a && { backgroundColor: colors.primary },
              ]}
            >
              <Text
                style={[styles.chipText, { color: amount === a ? colors.primaryForeground : colors.textSecondary }]}
              >
                {formatPunkte(a)} P.
              </Text>
            </Pressable>
          ))}
          {affordable.length === 0 ? (
            <Text style={[styles.meta, { color: colors.error }]}>Nicht genug Punkte.</Text>
          ) : null}
        </View>

        <Text style={[styles.meta, { color: colors.textTertiary }]}>
          {quote
            ? `Gebühr ${formatPunkte(quote.fee)} P. an Autor:in · ${formatPunkte(quote.sharesOut)} Anteile`
            : 'Vorschau wird geladen …'}
        </Text>

        <Pressable
          onPress={() => void handleSubmit()}
          disabled={!canSubmit}
          style={[styles.submit, { backgroundColor: colors.primary, opacity: canSubmit ? 1 : 0.5 }]}
        >
          <Text style={[styles.submitText, { color: colors.primaryForeground }]}>
            {submitting ? 'Wird gespeichert …' : 'Einschätzung abgeben'}
          </Text>
        </Pressable>
      </View>
    </BottomDrawer>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingBottom: 24, gap: 10 },
  title: { fontSize: 16, fontFamily: fontFamily.semiBold },
  excerpt: { fontSize: 13, fontFamily: fontFamily.regular, lineHeight: 18 },
  meta: { fontSize: 12, fontFamily: fontFamily.regular },
  toggleRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  toggle: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  toggleText: { fontSize: 13, fontFamily: fontFamily.medium },
  label: { fontSize: 12, fontFamily: fontFamily.medium, marginTop: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  chipText: { fontSize: 13, fontFamily: fontFamily.medium },
  submit: { borderRadius: 999, paddingVertical: 13, alignItems: 'center', marginTop: 10 },
  submitText: { fontSize: 15, fontFamily: fontFamily.semiBold },
});
