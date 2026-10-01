import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import { useTheme } from '@/context/ThemeContext';
import { useVerificationContext } from '@/context/VerificationContext';
import { fontFamily } from '@/constants/theme';
import { displayNames, fetchVorhabenOverview, type VorhabenOverview } from '@/lib/vorhaben';
import { formatAmount } from '@/lib/vorhaben-labels';
import VorhabenStepper from './VorhabenStepper';
import TaskCard from './TaskCard';

type Props = { proposalKey: string; proposerWallet: string | null | undefined };

/** Lifecycle block on the proposal screen. Renders nothing for proposals without a Vorhaben. */
export default function VorhabenSection({ proposalKey, proposerWallet }: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  const account = useActiveAccount();
  const { hasAttesterNFT } = useVerificationContext();
  const [overview, setOverview] = useState<VorhabenOverview | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());

  useFocusEffect(useCallback(() => {
    let alive = true;
    (async () => {
      try {
        const o = await fetchVorhabenOverview(proposalKey);
        if (!alive) return;
        setOverview(o);
        const assignees = (o?.tasks ?? []).map((t) => t.assignee_wallet).filter((w): w is string => !!w);
        if (assignees.length) {
          const n = await displayNames(assignees);
          if (alive) setNames(n);
        }
      } catch {
        // A failed read hides the block; the proposal itself stays usable.
      }
    })();
    return () => { alive = false; };
  }, [proposalKey]));

  if (!overview) return null;

  const me = account?.address?.toLowerCase();
  const isProposer = !!me && !!proposerWallet && proposerWallet.toLowerCase() === me;
  const canCreate = (isProposer || hasAttesterNFT) && overview.stage !== 'abgelehnt' && overview.stage !== 'umgesetzt';
  const confirmed = overview.wahlhelfer.filter((w) => w.confirmed).length;
  const totals = overview.totals.map((t) => formatAmount(t.amount, t.asset)).join(' · ');

  return (
    <View style={[styles.wrap, { borderTopColor: colors.border }]}>
      <Text style={[styles.heading, { color: colors.textPrimary }]}>Umsetzung</Text>
      <VorhabenStepper stage={overview.stage} />

      <View style={styles.headRow}>
        <Text style={[styles.subheading, { color: colors.textPrimary }]}>Aufgaben</Text>
        {canCreate && (
          <Pressable onPress={() => router.push(`/aufgabe/neu?proposalKey=${encodeURIComponent(proposalKey)}` as any)}
            accessibilityRole="button" hitSlop={8}
            style={({ pressed }) => [styles.addButton, { borderColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}>
            <Text style={[styles.addText, { color: colors.primary }]}>+ Aufgabe</Text>
          </Pressable>
        )}
      </View>
      {overview.tasks.length === 0 ? (
        <Text style={[styles.muted, { color: colors.textSecondary }]}>Noch keine Aufgaben.</Text>
      ) : (
        <View style={styles.list}>
          {overview.tasks.map((t) => (
            <TaskCard key={t.id} task={t}
              assigneeName={t.assignee_wallet ? names.get(t.assignee_wallet.toLowerCase()) ?? null : null}
              onPress={() => router.push(`/aufgabe/${t.id}` as any)} />
          ))}
        </View>
      )}

      {overview.wahlhelfer.length > 0 && (
        <View style={[styles.row, { borderColor: colors.border }]}>
          <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>Wahlhelfer:innen</Text>
          <Text style={[styles.rowValue, { color: colors.textSecondary }]}>
            {confirmed} von {overview.wahlhelfer.length} haben bestätigt
          </Text>
        </View>
      )}

      {overview.lineCount > 0 && (
        <Pressable onPress={() => router.push(`/vertrag/${proposalKey}` as any)} accessibilityRole="button"
          style={({ pressed }) => [styles.row, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>Vertrag</Text>
            <Text style={[styles.rowValue, { color: colors.textSecondary }]}>
              Gesamt: {totals} · {overview.lineCount} {overview.lineCount === 1 ? 'Position' : 'Positionen'}
            </Text>
          </View>
          <Text style={[styles.chevron, { color: colors.textSecondary }]}>›</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 20, marginTop: 24, paddingTop: 20, borderTopWidth: StyleSheet.hairlineWidth, gap: 14 },
  heading: { fontFamily: fontFamily.heading, fontSize: 20 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  subheading: { fontFamily: fontFamily.semiBold, fontSize: 16 },
  addButton: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  addText: { fontFamily: fontFamily.semiBold, fontSize: 14 },
  list: { gap: 10 },
  muted: { fontFamily: fontFamily.regular, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderWidth: 1, borderRadius: 14, padding: 14 },
  rowLabel: { fontFamily: fontFamily.semiBold, fontSize: 15 },
  rowValue: { fontFamily: fontFamily.regular, fontSize: 13 },
  chevron: { fontFamily: fontFamily.regular, fontSize: 24, lineHeight: 26 },
});
