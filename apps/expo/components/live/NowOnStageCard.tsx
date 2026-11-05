import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
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

/** "Jetzt auf der Fläche" + "Als Nächstes"; the current item slides in fresh whenever it changes. */
export default function NowOnStageCard({ current, next, showTitle, onOpenProgram }: Props) {
  const L = useLivePalette();
  const styles = liveStyles(makeStyles, L);
  return (
    <Animated.View layout={LinearTransition.duration(220)} style={styles.card}>
      <View style={styles.row}>
        <View style={styles.main}>
          <View style={styles.kickerRow}>
            <View style={[styles.kickerDot, !current && { backgroundColor: L.textTertiary }]} />
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
          <Ionicons name="list" size={16} color={L.text} />
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

const makeStyles = (L: LivePalette) => StyleSheet.create({
  card: {
    marginHorizontal: 12, marginTop: 12, padding: 14, borderRadius: 16, backgroundColor: L.surface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: L.border, overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  main: { flex: 1, gap: 8 },
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kickerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: L.accent },
  kicker: { color: L.accent, fontSize: 11, fontFamily: F.bold, letterSpacing: 1.2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  thumb: { width: 44, height: 44, borderRadius: 10, backgroundColor: L.surfaceRaised },
  titleText: { flex: 1, gap: 2 },
  title: { color: L.text, fontSize: 20, lineHeight: 24, fontFamily: F.heading },
  subtitle: { color: L.textSecondary, fontSize: 13, fontFamily: F.medium },
  programBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 34, borderRadius: 17,
    backgroundColor: L.surfaceRaised,
  },
  programText: { color: L.text, fontSize: 13, fontFamily: F.semiBold },
  pressed: { opacity: 0.7 },
  nextRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: L.border,
  },
  nextLabel: { color: L.textTertiary, fontSize: 12, fontFamily: F.semiBold },
  nextTitle: { flex: 1, color: L.textSecondary, fontSize: 13, fontFamily: F.semiBold },
  nextTime: { color: L.textTertiary, fontSize: 12, fontFamily: F.medium, fontVariant: ['tabular-nums'] },
});
