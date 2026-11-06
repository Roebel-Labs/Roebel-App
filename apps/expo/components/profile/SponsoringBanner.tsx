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
          <Text style={[styles.sub, { color: colors.textSecondary }]}>Im Livestream vor ganz Röbel</Text>
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
  card: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, paddingVertical: 14, paddingLeft: 18, paddingRight: 10, gap: 6 },
  textBlock: { flex: 1, gap: 6, alignItems: 'flex-start' },
  title: { fontFamily: fontFamily.heading, fontSize: 17, lineHeight: 21 },
  sub: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 17 },
  chip: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#E5484D' },
  chipText: { fontFamily: fontFamily.bold, fontSize: 10, color: '#FFFFFF', letterSpacing: 0.4 },
  cta: { borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12, marginTop: 6 },
  ctaText: { fontFamily: fontFamily.semiBold, fontSize: 12 },
  illustration: { width: 150, height: 116 },
});
