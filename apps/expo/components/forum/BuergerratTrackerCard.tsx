import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { fetchBuergerratSummary } from '@/lib/supabase-forum';
import { BUERGERRAT_YEAR_LABEL } from '@/lib/buergerrat';

const ILLUSTRATION = require('@/assets/illustration/buergerumfragen-cropped.png');

/**
 * Pinned entry at the top of the Umfragen tab: how many recommendations,
 * how many decided / done. Hides itself when there is nothing to track.
 */
export default function BuergerratTrackerCard() {
  const { colors } = useTheme();
  const router = useRouter();
  const { data } = useQuery({
    queryKey: ['forum', 'buergerrat', 'summary'],
    queryFn: fetchBuergerratSummary,
    staleTime: 5 * 60_000,
  });
  if (!data || data.count === 0) return null;

  return (
    <Pressable
      onPress={() => router.push('/forum/buergerrat' as any)}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.surfaceSecondary },
        pressed && { opacity: 0.92 },
      ]}
      accessibilityRole="button"
      accessibilityLabel="Bürgerrat-Empfehlungen ansehen"
    >
      <Image source={ILLUSTRATION} style={styles.illustration} contentFit="contain" />
      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{BUERGERRAT_YEAR_LABEL}</Text>
        <Text style={[styles.sub, { color: colors.textSecondary }]} numberOfLines={1}>
          {data.count} Empfehlungen · {data.beschlossen} beschlossen · {data.umgesetzt} umgesetzt
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
  },
  illustration: { width: 44, height: 44 },
  body: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontFamily: fontFamily.semiBold },
  sub: { fontSize: 12, fontFamily: fontFamily.regular },
});
