import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { softShadow } from '@/lib/shadow';
import { fetchMyTasks, type TaskRow } from '@/lib/vorhaben';
import { nextStepFor, TASK_STATUS_LABELS } from '@/lib/vorhaben-labels';

/** "Meine Aufgaben": proposal tasks assigned to this person that still need something. Hidden when empty. */
export default function MyTasksCard({ wallet }: { wallet: string | undefined }) {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const [tasks, setTasks] = useState<(TaskRow & { proposalNumber: number })[]>([]);

  useFocusEffect(useCallback(() => {
    let alive = true;
    if (wallet) fetchMyTasks(wallet).then((t) => { if (alive) setTasks(t); }).catch(() => undefined);
    else setTasks([]);
    return () => { alive = false; };
  }, [wallet]));

  if (!wallet || tasks.length === 0) return null;
  return (
    <View style={[styles.card, { backgroundColor: colors.background }, softShadow(2, isDark)]}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Meine Aufgaben</Text>
      {tasks.map((t, i) => (
        <Pressable key={t.id} onPress={() => router.push(`/aufgabe/${t.id}` as any)} accessibilityRole="button" accessibilityLabel={t.title}
          style={({ pressed }) => [styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, { opacity: pressed ? 0.7 : 1 }]}>
          <View style={[styles.dot, { backgroundColor: colors.primary }]} />
          <View style={styles.rowText}>
            <Text numberOfLines={1} style={[styles.rowTitle, { color: colors.textPrimary }]}>{t.title}</Text>
            <Text numberOfLines={1} style={[styles.rowSubtitle, { color: colors.textSecondary }]}>
              {nextStepFor(t, wallet) ?? TASK_STATUS_LABELS[t.status]} · Vorschlag #{t.proposalNumber}
            </Text>
          </View>
          <Text style={[styles.chevron, { color: colors.textSecondary }]}>›</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, marginHorizontal: 16, marginTop: 16 },
  title: { fontFamily: fontFamily.semiBold, fontSize: 18, lineHeight: 24, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontFamily: fontFamily.medium, fontSize: 15, lineHeight: 20 },
  rowSubtitle: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 18 },
  chevron: { fontFamily: fontFamily.regular, fontSize: 24, lineHeight: 26 },
});
