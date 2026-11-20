import React, { useCallback, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import Animated, { FadeIn } from 'react-native-reanimated';
import PressableScale from '@/components/PressableScale';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { ShimmerSkeleton } from '@/components/SkeletonLoader';
import { fetchBookingDeadline, isBookingOpen } from '@/lib/sponsoring';

const ILLUSTRATION = require('@/assets/illustration/dancecup/dancecup_illu.png');

type Props = { slug: string };

/** Deadline per slug for this app session: later profile visits render the card at once, without skeleton or fade. */
const deadlineCache = new Map<string, string | null>();

/** Shared by the card (minHeight) and its skeleton so the swap never shifts the grid below. */
const CARD_HEIGHT = 160;

/**
 * Org-only profile card for a sponsoring campaign (DanceCup livestream). A card-sized skeleton holds
 * the space on the first load (the action grid below would jump otherwise), then the card fades in.
 * Renders nothing when the campaign is missing/inactive or after the booking deadline.
 */
export default function SponsoringBanner({ slug }: Props) {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const [deadline, setDeadline] = useState<string | null | undefined>(() => deadlineCache.get(slug));
  const [fade] = useState(() => !deadlineCache.has(slug));

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      fetchBookingDeadline(slug)
        .then((d) => { deadlineCache.set(slug, d); if (alive) setDeadline(d); })
        .catch(() => { if (alive) setDeadline((cur) => cur ?? null); });
      return () => { alive = false; };
    }, [slug]),
  );

  if (deadline === undefined) {
    return (
      <View style={styles.wrap} accessibilityLabel="Wird geladen">
        <ShimmerSkeleton width="100%" height={CARD_HEIGHT} borderRadius={20} />
      </View>
    );
  }
  if (!deadline || !isBookingOpen({ booking_deadline: deadline })) return null;

  return (
    <Animated.View entering={fade ? FadeIn.duration(260) : undefined}>
      <PressableScale
        onPress={() => router.push(`/org/sponsoring/${slug}` as any)}
        accessibilityRole="button"
        accessibilityLabel="Ihre Werbung beim Müritz DanceCup am Samstag, 7. November, im Livestream. Mehr erfahren"
        scaleTo={0.98}
        style={styles.wrap}
      >
        <View
          style={[
            styles.card,
            { backgroundColor: isDark ? colors.surface : '#FFFFFF' },
            Platform.select({
              // Airbnb-style card: a wide, soft, low-opacity shadow instead of a tight dark one.
              ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: isDark ? 0.3 : 0.08, shadowRadius: 20 },
              android: { elevation: 8, shadowColor: 'rgba(0,0,0,0.35)' },
            }),
          ]}
        >
          <View style={styles.textBlock}>
            <View style={styles.chip}><Text style={styles.chipText}>LIVE · Sa., 7. Nov.</Text></View>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Ihre Werbung beim Müritz DanceCup</Text>
          </View>
          <Image source={ILLUSTRATION} style={styles.illustration} contentFit="contain" accessible={false} />
        </View>
      </PressableScale>
    </Animated.View>
  );
}


const styles = StyleSheet.create({
  wrap: { marginHorizontal: 16, marginTop: 16 },
  card: { minHeight: CARD_HEIGHT, flexDirection: 'row', alignItems: 'center', borderRadius: 20, paddingVertical: 14, paddingLeft: 18, paddingRight: 10, gap: 6 },
  textBlock: { flex: 1, gap: 6, alignItems: 'flex-start' },
  title: { fontFamily: fontFamily.heading, fontSize: 20, lineHeight: 24 },
  chip: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#E5484D' },
  chipText: { fontFamily: fontFamily.bold, fontSize: 10, color: '#FFFFFF', letterSpacing: 0.4 },
  illustration: { width: 150, height: 116 },
});
