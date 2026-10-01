import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { STAGE_LABELS, STAGE_STEPS, type Stage } from '@/lib/vorhaben-labels';
import StatusChip from './StatusChip';

/** Horizontal lifecycle stepper: Abstimmung → … → Umgesetzt. A rejected proposal shows one pill. */
export default function VorhabenStepper({ stage }: { stage: Stage }) {
  const { colors } = useTheme();
  if (stage === 'abgelehnt') return <StatusChip label={STAGE_LABELS.abgelehnt} tone="error" />;
  const current = Math.max(0, STAGE_STEPS.indexOf(stage));
  return (
    <View style={styles.row} accessibilityLabel={`Stand: ${STAGE_LABELS[stage]}`}>
      {STAGE_STEPS.map((s, i) => {
        const reached = i <= current;
        return (
          <View key={s} style={styles.step}>
            <View style={styles.track}>
              <View style={[styles.line, { backgroundColor: i === 0 ? 'transparent' : reached ? colors.primary : colors.border }]} />
              <View style={[styles.dot, reached ? { backgroundColor: colors.primary } : { borderWidth: 2, borderColor: colors.border, backgroundColor: colors.background }]} />
              <View style={[styles.line, { backgroundColor: i === STAGE_STEPS.length - 1 ? 'transparent' : i < current ? colors.primary : colors.border }]} />
            </View>
            <Text numberOfLines={2} style={[styles.label, { color: i === current ? colors.textPrimary : colors.textSecondary, fontFamily: i === current ? fontFamily.semiBold : fontFamily.regular }]}>
              {STAGE_LABELS[s]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  step: { flex: 1, alignItems: 'center', gap: 6 },
  track: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  line: { flex: 1, height: 2 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  label: { fontSize: 11, lineHeight: 14, textAlign: 'center' },
});
