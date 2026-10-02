import React, { useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { STAGE_LABELS, STAGE_STEPPER_LABELS, STAGE_STEPS, type Stage } from '@/lib/vorhaben-labels';
import StatusChip from './StatusChip';

// Fixed step width so labels stay readable; the row scrolls horizontally when
// it is wider than the screen.
const STEP_WIDTH = 116;

/** Horizontal lifecycle stepper: Bürgerabstimmung → … → Umgesetzt. A rejected proposal shows one pill. */
export default function VorhabenStepper({ stage }: { stage: Stage }) {
  const { colors } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  if (stage === 'abgelehnt') return <StatusChip label={STAGE_LABELS.abgelehnt} tone="error" />;
  const current = Math.max(0, STAGE_STEPS.indexOf(stage));

  // Bring the current step into view, one step of context to its left.
  const scrollToCurrent = () => {
    scrollRef.current?.scrollTo({ x: Math.max(0, (current - 1) * STEP_WIDTH), animated: false });
  };

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      onContentSizeChange={scrollToCurrent}
      contentContainerStyle={styles.row}
      accessibilityLabel={`Stand: ${STAGE_LABELS[stage]}`}
    >
      {STAGE_STEPS.map((s, i) => {
        const reached = i <= current;
        const isCurrent = i === current;
        return (
          <View key={s} style={styles.step}>
            <View style={styles.track}>
              <View style={[styles.line, { backgroundColor: i === 0 ? 'transparent' : reached ? colors.primary : colors.border }]} />
              <View
                style={[
                  styles.dot,
                  reached ? { backgroundColor: colors.primary } : { borderWidth: 2, borderColor: colors.border, backgroundColor: colors.background },
                  isCurrent && { width: 20, height: 20, borderRadius: 10 },
                ]}
              />
              <View style={[styles.line, { backgroundColor: i === STAGE_STEPS.length - 1 ? 'transparent' : i < current ? colors.primary : colors.border }]} />
            </View>
            <Text
              numberOfLines={2}
              android_hyphenationFrequency="full"
              textBreakStrategy="highQuality"
              accessibilityLabel={STAGE_LABELS[s]}
              style={[
                styles.label,
                {
                  color: isCurrent ? colors.textPrimary : colors.textSecondary,
                  fontFamily: isCurrent ? fontFamily.semiBold : fontFamily.regular,
                },
              ]}
            >
              {STAGE_STEPPER_LABELS[s]}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 4 },
  step: { width: STEP_WIDTH, alignItems: 'center', gap: 8 },
  track: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', height: 20 },
  line: { flex: 1, height: 3 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  label: { fontSize: 14, lineHeight: 19, textAlign: 'center', paddingHorizontal: 4 },
});
