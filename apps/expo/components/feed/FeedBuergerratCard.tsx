import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { BUERGERRAT_TITLE, isBuergerratNew } from '@/lib/buergerrat';
import type { BuergerratSummary } from '@/lib/types/feed';

const ILLUSTRATION = require('@/assets/illustration/buergerumfragen.png');

// Post cards use 16px padding + a 46px avatar rail; the feed's module wrapper
// already adds 8px on each side, so these insets put the card exactly under a
// post's text column, like a post from the Stadt.
const POST_CONTENT_INSET_LEFT = 16 + 46 - 8;
const POST_CONTENT_INSET_RIGHT = 16 - 8;

type Props = {
  summary: BuergerratSummary;
  onPress: () => void;
};

/** Main-feed entry into the Bürgerrat recommendations (Max's mockup, 2026-09-16). */
export default function FeedBuergerratCard({ summary, onPress }: Props) {
  const { colors, isDark } = useTheme();
  const isNew = isBuergerratNew(summary.newestCreatedAt);
  const surface = colors.surfaceSecondary;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: surface },
        pressed && { opacity: 0.92 },
      ]}
      accessibilityRole="button"
      accessibilityLabel="Bürgerrat: Empfehlungen ansehen"
    >
      <View style={styles.illustrationWrap}>
        <Image source={ILLUSTRATION} style={styles.illustration} contentFit="contain" />
        {/* The box fades into the card towards the bottom (mockup). */}
        <LinearGradient
          colors={[`${surface}00`, surface]}
          style={styles.fade}
          pointerEvents="none"
        />
      </View>
      <View style={styles.labelRow}>
        {isNew && (
          <LinearGradient
            colors={isDark ? ['#3B3C40', '#2A2B2E'] : ['#FFFFFF', '#E9EBEF']}
            style={[styles.pill, { borderColor: colors.border }]}
          >
            <Text style={[styles.pillText, { color: colors.textSecondary }]}>NEU</Text>
          </LinearGradient>
        )}
        <Text style={[styles.label, { color: colors.primary }]}>Bürgerrat</Text>
      </View>
      <Text style={[styles.title, { color: colors.textPrimary }]}>{BUERGERRAT_TITLE}</Text>
      <View style={[styles.button, { backgroundColor: colors.primary }]}>
        <Text style={[styles.buttonText, { color: colors.onPrimary }]}>Mehr dazu</Text>
        <Ionicons name="arrow-forward" size={16} color={colors.onPrimary} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginLeft: POST_CONTENT_INSET_LEFT,
    marginRight: POST_CONTENT_INSET_RIGHT,
    borderRadius: 16,
    paddingTop: 12,
    paddingBottom: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 10,
  },
  illustrationWrap: { width: 150, height: 150 },
  illustration: { width: 150, height: 150 },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 70 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { fontSize: 10, fontFamily: fontFamily.medium, letterSpacing: 0.4 },
  label: { fontSize: 14, fontFamily: fontFamily.medium },
  title: { fontSize: 26, lineHeight: 32, fontFamily: fontFamily.heading, textAlign: 'center' },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 2,
  },
  buttonText: { fontSize: 14, fontFamily: fontFamily.semiBold },
});
