import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { softShadow } from '@/lib/shadow';
import { fetchOpenTallyDuties, type TallyDuty } from '@/lib/vorhaben';
import { timeLeft } from '@/lib/vorhaben-labels';
import { demoTallyDuty, isPreviewChannel } from '@/lib/vorhaben-preview';

export default function TallyDutyCard({ wallet }: { wallet: string | undefined }) {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const [duties, setDuties] = useState<TallyDuty[]>([]);

  useFocusEffect(useCallback(() => {
    let alive = true;
    // Preview builds show a demo duty when there is no real one, so the flow can be reviewed.
    if (wallet) fetchOpenTallyDuties(wallet).then((d) => { if (alive) setDuties(d.length === 0 && isPreviewChannel() ? [demoTallyDuty()] : d); });
    return () => { alive = false; };
  }, [wallet]));

  if (duties.length === 0) return null;
  return (
    <View style={[styles.card, { backgroundColor: colors.background }, softShadow(2, isDark)]}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Auszählung bestätigen</Text>
      <Text style={[styles.lead, { color: colors.textSecondary }]}>Als Wahlhelfer:in bestätigst du das Ergebnis.</Text>
      {duties.map((d, i) => (
        <Pressable key={d.proposalUuid} onPress={() => router.push(`/auszaehlung/${d.proposalKey}` as any)}
          accessibilityRole="button" accessibilityLabel={`Vorschlag ${d.proposalNumber} bestätigen`}
          style={({ pressed }) => [styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, { opacity: pressed ? 0.7 : 1 }]}>
          <View style={[styles.dot, { backgroundColor: colors.primary }]} />
          <View style={styles.rowText}>
            <Text style={[styles.rowTitle, { color: colors.textPrimary }]}>Vorschlag #{d.proposalNumber}</Text>
            <Text numberOfLines={1} style={[styles.rowSubtitle, { color: colors.textSecondary }]}>{d.title} · {timeLeft(d.until, Date.now())}</Text>
          </View>
          <Text style={[styles.chevron, { color: colors.textSecondary }]}>›</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, marginHorizontal: 16, marginTop: 16 },
  title: { fontFamily: fontFamily.semiBold, fontSize: 18, lineHeight: 24 },
  lead: { fontFamily: fontFamily.regular, fontSize: 13, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontFamily: fontFamily.medium, fontSize: 15, lineHeight: 20 },
  rowSubtitle: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 18 },
  chevron: { fontFamily: fontFamily.regular, fontSize: 24, lineHeight: 26 },
});
