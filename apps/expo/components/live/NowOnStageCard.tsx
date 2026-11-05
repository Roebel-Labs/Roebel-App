import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp, LinearTransition } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { formatClock, type RundownItem } from '@/lib/live';
import { F, liveStyles, useLivePalette, type LivePalette } from './tokens';

type Props = {
  current: RundownItem | null;
  next: RundownItem | null;
  showTitle: string;
  onOpenProgram: () => void;
};

/** Slim on-stage row (≈ 52 px): dot · group + subtitle · "Als Nächstes" line · Programm chip. */
export default function NowOnStageCard({ current, next, showTitle, onOpenProgram }: Props) {
  const L = useLivePalette();
  const styles = liveStyles(makeStyles, L);
  const nextClock = next ? formatClock(next.planned_at) : null;
  return (
    <Animated.View layout={LinearTransition.duration(220)} style={styles.bar}>
      <View style={[styles.dot, !current && styles.dotIdle]} />
      <View style={styles.main}>
        <Animated.View key={current?.id ?? 'none'} entering={FadeInDown.duration(280)} exiting={FadeOutUp.duration(160)}>
          <Text style={styles.titleLine} numberOfLines={1}>
            <Text style={styles.title}>{current?.title ?? showTitle}</Text>
            {current?.subtitle ? <Text style={styles.subtitle}>{`  ${current.subtitle}`}</Text> : null}
          </Text>
        </Animated.View>
        {next ? (
          <Text key={`next-${next.id}`} style={styles.next} numberOfLines={1}>
            {`Als Nächstes: ${next.title}${nextClock ? ` · ca. ${nextClock}` : ''}`}
          </Text>
        ) : null}
      </View>
      <Pressable
        onPress={onOpenProgram}
        hitSlop={8}
        style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Programm öffnen"
      >
        <Ionicons name="list" size={14} color={L.text} />
        <Text style={styles.chipText}>Programm</Text>
      </Pressable>
    </Animated.View>
  );
}

const makeStyles = (L: LivePalette) => StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 14, paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: L.red },
  dotIdle: { backgroundColor: L.textTertiary },
  main: { flex: 1, gap: 1, overflow: 'hidden' },
  titleLine: { fontSize: 15, lineHeight: 20 },
  title: { color: L.text, fontSize: 15, fontFamily: F.bold },
  subtitle: { color: L.textSecondary, fontSize: 13, fontFamily: F.medium },
  next: { color: L.textTertiary, fontSize: 12, lineHeight: 16, fontFamily: F.medium },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 28, borderRadius: 14,
    backgroundColor: L.surfaceRaised,
  },
  chipText: { color: L.text, fontSize: 12, fontFamily: F.semiBold },
  pressed: { opacity: 0.7 },
});
