import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { STAGE_LABELS, STEPPER_STAGES, formatStageDate, stepperState } from '@/lib/forum-stages';
import type { ForumStage, ForumStageEventRecord } from '@/lib/types/feed';

type Props = {
  stage: ForumStage | null;
  events?: ForumStageEventRecord[];
};

/**
 * Where a recommendation stands: four steps (Diskussion → Beschlussvorlage →
 * Beschlossen → Umgesetzt) or a terminal badge, plus the dated Verlauf.
 * Renders nothing for threads without a stage (ordinary citizen threads).
 */
export default function ForumStageStepper({ stage, events = [] }: Props) {
  const { colors } = useTheme();
  const state = stepperState(stage);
  if (state.kind === 'none') return null;

  return (
    <View style={styles.wrap}>
      {state.kind === 'terminal' ? (
        <View
          style={[
            styles.terminal,
            { backgroundColor: state.stage === 'abgelehnt' ? colors.errorBackground : colors.surfaceSecondary },
          ]}
        >
          <Text
            style={[
              styles.terminalText,
              { color: state.stage === 'abgelehnt' ? colors.error : colors.textSecondary },
            ]}
          >
            {STAGE_LABELS[state.stage]}
          </Text>
        </View>
      ) : (
        <View style={styles.steps}>
          {STEPPER_STAGES.map((s, i) => {
            const reached = i <= state.current;
            const current = i === state.current;
            const last = i === STEPPER_STAGES.length - 1;
            return (
              <View key={s} style={styles.step}>
                <View style={styles.dotRow}>
                  <View
                    style={[
                      styles.line,
                      { backgroundColor: i === 0 ? 'transparent' : reached ? colors.primary : colors.border },
                    ]}
                  />
                  <View
                    style={[
                      styles.dot,
                      {
                        borderColor: reached ? colors.primary : colors.border,
                        backgroundColor: reached ? colors.primary : colors.background,
                      },
                    ]}
                  />
                  <View
                    style={[
                      styles.line,
                      { backgroundColor: last ? 'transparent' : i < state.current ? colors.primary : colors.border },
                    ]}
                  />
                </View>
                <Text
                  style={[
                    styles.stepLabel,
                    {
                      color: current ? colors.textPrimary : colors.textTertiary,
                      fontFamily: current ? fontFamily.semiBold : fontFamily.regular,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {STAGE_LABELS[s]}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {events.length > 0 && (
        <View style={styles.history}>
          {events.map((e) => (
            <Text key={e.id} style={[styles.historyLine, { color: colors.textSecondary }]}>
              {formatStageDate(e.occurred_at)} · {STAGE_LABELS[e.stage]}
              {e.note ? ` · ${e.note}` : ''}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  steps: { flexDirection: 'row' },
  step: { flex: 1, alignItems: 'center', gap: 6 },
  dotRow: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  line: { flex: 1, height: 2 },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  stepLabel: { fontSize: 10, textAlign: 'center' },
  terminal: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  terminalText: { fontSize: 12, fontFamily: fontFamily.semiBold },
  history: { gap: 4 },
  historyLine: { fontSize: 12, fontFamily: fontFamily.regular, lineHeight: 17 },
});
