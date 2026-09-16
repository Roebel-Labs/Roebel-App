import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { BUERGERRAT_TITLE, isBuergerratNew } from '@/lib/buergerrat';
import type { BuergerratSummary } from '@/lib/types/feed';

const ILLUSTRATION = require('@/assets/illustration/buergerumfragen.png');

type Props = {
  summary: BuergerratSummary;
  onPress: () => void;
};

/** Main-feed entry into the Bürgerrat recommendations (Max's mockup, 2026-09-16). */
export default function FeedBuergerratCard({ summary, onPress }: Props) {
  const { colors } = useTheme();
  const isNew = isBuergerratNew(summary.newestCreatedAt);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.surfaceSecondary },
        pressed && { opacity: 0.92 },
      ]}
      accessibilityRole="button"
      accessibilityLabel="Bürgerrat: Empfehlungen ansehen"
    >
      <Image source={ILLUSTRATION} style={styles.illustration} contentFit="contain" />
      <View style={styles.labelRow}>
        {isNew && (
          <View style={[styles.pill, { borderColor: colors.border }]}>
            <Text style={[styles.pillText, { color: colors.textSecondary }]}>NEU</Text>
          </View>
        )}
        <Text style={[styles.label, { color: colors.primary }]}>Bürgerrat</Text>
      </View>
      <Text style={[styles.title, { color: colors.textPrimary }]}>{BUERGERRAT_TITLE}</Text>
      <View style={[styles.button, { backgroundColor: colors.primary }]}>
        <Text style={[styles.buttonText, { color: colors.onPrimary }]}>Mehr dazu</Text>
        <Ionicons name="arrow-forward" size={18} color={colors.onPrimary} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 12,
  },
  illustration: { width: 190, height: 190 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  pillText: { fontSize: 12, fontFamily: fontFamily.medium, letterSpacing: 0.4 },
  label: { fontSize: 17, fontFamily: fontFamily.medium },
  title: { fontSize: 26, lineHeight: 32, fontFamily: fontFamily.heading, textAlign: 'center' },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 4,
  },
  buttonText: { fontSize: 16, fontFamily: fontFamily.semiBold },
});
