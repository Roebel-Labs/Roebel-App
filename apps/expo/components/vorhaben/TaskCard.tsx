import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import type { TaskRow } from '@/lib/vorhaben';
import { formatAmount, TASK_STATUS_LABELS, taskTone } from '@/lib/vorhaben-labels';
import StatusChip from './StatusChip';

type Props = { task: TaskRow; assigneeName: string | null; onPress: () => void };

export default function TaskCard({ task, assigneeName, onPress }: Props) {
  const { colors } = useTheme();
  const n = task.acceptance_criteria.length;
  const who = task.assignee_wallet
    ? `Zuständig: ${assigneeName ?? 'Unbekannt'}`
    : task.status === 'offen' ? 'Noch offen – jetzt bewerben' : null;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={task.title}
      style={({ pressed }) => [styles.card, { borderColor: colors.border, backgroundColor: colors.card, opacity: pressed ? 0.8 : 1 }]}>
      <View style={styles.top}>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>{task.title}</Text>
        <StatusChip label={TASK_STATUS_LABELS[task.status] ?? task.status} tone={taskTone(task.status)} />
      </View>
      <Text style={[styles.reward, { color: colors.textPrimary }]}>{formatAmount(task.reward_amount, task.reward_asset)}</Text>
      <View style={styles.meta}>
        {who && <Text style={[styles.metaText, { color: colors.textSecondary }]} numberOfLines={1}>{who}</Text>}
        <Text style={[styles.metaText, { color: colors.textSecondary }]}>{n === 1 ? '1 Kriterium' : `${n} Kriterien`}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 6 },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  title: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: 15, lineHeight: 20 },
  reward: { fontFamily: fontFamily.medium, fontSize: 14 },
  meta: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  metaText: { flexShrink: 1, fontFamily: fontFamily.regular, fontSize: 13 },
});
