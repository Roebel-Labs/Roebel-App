import React, { useCallback, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import PressableScale from '@/components/PressableScale';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { fetchCampaign, isBookingOpen, type CampaignView } from '@/lib/sponsoring';

const ILLUSTRATION = require('@/assets/illustration/dancecup/dancecup_illu.png');

type Props = { slug: string };

/**
 * Org-only profile card for a sponsoring campaign (DanceCup livestream). Renders nothing while
 * loading, when the campaign is missing/inactive (e.g. migration not applied) or after the
 * booking deadline, so it can never block the profile.
 */
export default function SponsoringBanner({ slug }: Props) {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const [view, setView] = useState<CampaignView | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      fetchCampaign(slug).then((v) => { if (alive) setView(v); }).catch(() => undefined);
      return () => { alive = false; };
    }, [slug]),
  );

  if (!view || !isBookingOpen(view.campaign)) return null;

  return (
    <PressableScale
      onPress={() => router.push(`/org/sponsoring/${slug}` as any)}
      accessibilityRole="button"
      accessibilityLabel="Ihre Werbung beim Müritz DanceCup. Mehr erfahren"
      scaleTo={0.98}
      style={styles.wrap}
    >
      <View
        style={[
          styles.card,
          { backgroundColor: isDark ? colors.surface : '#FFFFFF' },
          Platform.select({
            ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: isDark ? 0.2 : 0.1, shadowRadius: 12 },
            android: { elevation: 3 },
          }),
        ]}
      >
        <View style={styles.textBlock}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Ihre Werbung beim Müritz DanceCup</Text>
          <View style={[styles.cta, { backgroundColor: colors.primary }]}>
            <Text style={[styles.ctaText, { color: colors.onPrimary }]}>Mehr erfahren</Text>
          </View>
        </View>
        <Image source={ILLUSTRATION} style={styles.illustration} contentFit="contain" accessible={false} />
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 16, marginTop: 16 },
  card: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, paddingVertical: 16, paddingLeft: 16, paddingRight: 12, gap: 8 },
  textBlock: { flex: 1, gap: 12, alignItems: 'flex-start' },
  title: { fontFamily: fontFamily.heading, fontSize: 17, lineHeight: 21 },
  cta: { borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  ctaText: { fontFamily: fontFamily.semiBold, fontSize: 14 },
  illustration: { width: 112, height: 87 },
});
