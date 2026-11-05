import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeInDown, FadeOutUp, LinearTransition } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { formatClock, type RundownItem } from '@/lib/live';
import { F, LIVE } from './tokens';

type Props = {
  current: RundownItem | null;
  next: RundownItem | null;
  showTitle: string;
  onOpenProgram: () => void;
};

/** "Jetzt auf der Fläche" + "Als Nächstes"; the current item slides in fresh whenever it changes. */
export default function NowOnStageCard({ current, next, showTitle, onOpenProgram }: Props) {
  return (
    <Animated.View layout={LinearTransition.duration(220)} style={styles.card}>
      <View style={styles.row}>
        <View style={styles.main}>
          <View style={styles.kickerRow}>
            <View style={[styles.kickerDot, !current && { backgroundColor: LIVE.textTertiary }]} />
            <Text style={styles.kicker}>{current ? 'JETZT AUF DER FLÄCHE' : 'PROGRAMM'}</Text>
          </View>
          <Animated.View key={current?.id ?? 'none'} entering={FadeInDown.duration(320)} exiting={FadeOutUp.duration(180)} style={styles.titleRow}>
            {current?.image_url ? (
              <Image source={{ uri: current.image_url }} style={styles.thumb} contentFit="cover" transition={150} />
            ) : null}
            <View style={styles.titleText}>
              <Text style={styles.title} numberOfLines={2}>{current?.title ?? showTitle}</Text>
              {current?.subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{current.subtitle}</Text> : null}
            </View>
          </Animated.View>
        </View>
        <Pressable onPress={onOpenProgram} hitSlop={6} style={({ pressed }) => [styles.programBtn, pressed && styles.pressed]} accessibilityRole="button">
          <Ionicons name="list" size={16} color={LIVE.text} />
          <Text style={styles.programText}>Programm</Text>
        </Pressable>
      </View>
      {next ? (
        <Animated.View key={`next-${next.id}`} entering={FadeInDown.delay(120).duration(280)} style={styles.nextRow}>
          <Text style={styles.nextLabel}>Als Nächstes</Text>
          <Text style={styles.nextTitle} numberOfLines={1}>{next.title}</Text>
          {formatClock(next.planned_at) ? <Text style={styles.nextTime}>{`ca. ${formatClock(next.planned_at)}`}</Text> : null}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 12, marginTop: 12, padding: 14, borderRadius: 16, backgroundColor: LIVE.surface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: LIVE.border, overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  main: { flex: 1, gap: 8 },
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kickerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: LIVE.accent },
  kicker: { color: LIVE.accent, fontSize: 11, fontFamily: F.bold, letterSpacing: 1.2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  thumb: { width: 44, height: 44, borderRadius: 10, backgroundColor: LIVE.surfaceRaised },
  titleText: { flex: 1, gap: 2 },
  title: { color: LIVE.text, fontSize: 20, lineHeight: 24, fontFamily: F.heading },
  subtitle: { color: LIVE.textSecondary, fontSize: 13, fontFamily: F.medium },
  programBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 34, borderRadius: 17,
    backgroundColor: LIVE.surfaceRaised,
  },
  programText: { color: LIVE.text, fontSize: 13, fontFamily: F.semiBold },
  pressed: { opacity: 0.7 },
  nextRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: LIVE.border,
  },
  nextLabel: { color: LIVE.textTertiary, fontSize: 12, fontFamily: F.semiBold },
  nextTitle: { flex: 1, color: LIVE.textSecondary, fontSize: 13, fontFamily: F.semiBold },
  nextTime: { color: LIVE.textTertiary, fontSize: 12, fontFamily: F.medium, fontVariant: ['tabular-nums'] },
});
