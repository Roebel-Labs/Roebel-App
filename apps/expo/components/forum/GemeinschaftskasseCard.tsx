import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { watchTreasuryEuro } from '@/lib/roebel-taler';
import { attesterSafeGnosisAddress } from '@/constants/gnosis';
import Skeleton from '@/components/ui/Skeleton';

const ILLUSTRATION = require('@/assets/illustration/weather/donations_hero.png');
/** donations_hero.png is 1488 × 818 (transparent sky, people + plants at the bottom). */
const ILLU_ASPECT = 1488 / 818;
const CARD_HEIGHT = 172;
/** How far the plants run below the card edge (the card clips them). */
const ILLU_SINK = 48;

/**
 * Pinned at the top of the Umfragen tab: the Gemeinschaftskasse total on the
 * same soft-blue garden scene as the treasury page. Tap → /treasury.
 */
export default function GemeinschaftskasseCard() {
  const { colors } = useTheme();
  const router = useRouter();
  const [euro, setEuro] = useState<number | null>(null);
  const [cardWidth, setCardWidth] = useState(0);

  // Snapshot-first (cache → Supabase → route → chain); skeleton until the first real figure.
  useEffect(() => watchTreasuryEuro(attesterSafeGnosisAddress, setEuro), []);

  const onLayout = (e: LayoutChangeEvent) => setCardWidth(e.nativeEvent.layout.width);
  const illuHeight = cardWidth / ILLU_ASPECT;

  return (
    <Pressable
      onLayout={onLayout}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        router.push('/treasury' as any);
      }}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.primaryLight },
        pressed && { transform: [{ scale: 0.98 }] },
      ]}
      accessibilityRole="button"
      accessibilityLabel={
        euro === null
          ? 'Gemeinschaftskasse ansehen'
          : `Gemeinschaftskasse: ${euro.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Euro. Ansehen`
      }
    >
      {cardWidth > 0 ? (
        <Image
          source={ILLUSTRATION}
          style={[styles.illustration, { width: cardWidth, height: illuHeight, bottom: -ILLU_SINK }]}
          contentFit="contain"
          accessible={false}
        />
      ) : null}
      <View style={styles.text}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>Gemeinschaftskasse</Text>
        {euro === null ? (
          <Skeleton width={140} height={34} radius={10} style={{ marginTop: 4 }} />
        ) : (
          <Text style={[styles.value, { color: colors.textPrimary }]} numberOfLines={1}>
            {euro.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€
          </Text>
        )}
      </View>
      <View style={[styles.chevron, { backgroundColor: colors.sheet }]}>
        <Ionicons name="chevron-forward" size={18} color={colors.textPrimary} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    height: CARD_HEIGHT,
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 10,
    borderRadius: 20,
    overflow: 'hidden',
  },
  illustration: { position: 'absolute', left: 0 },
  text: { paddingTop: 16, paddingHorizontal: 18 },
  label: { fontFamily: fontFamily.medium, fontSize: 14 },
  value: { fontFamily: fontFamily.bold, fontSize: 32, letterSpacing: -1, marginTop: 2 },
  chevron: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
