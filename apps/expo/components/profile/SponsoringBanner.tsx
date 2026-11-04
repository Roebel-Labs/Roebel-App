import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import PressableScale from '@/components/PressableScale';
import { fontFamily } from '@/constants/theme';
import { fetchCampaign, formatEuro, isBookingOpen, type CampaignView } from '@/lib/sponsoring';

const NAVY = '#00498B';
const NAVY_DEEP = '#002B55';

type Props = { slug: string };

/**
 * Org-only profile banner for a sponsoring campaign (DanceCup livestream). Renders nothing while
 * loading, when the campaign is missing/inactive (e.g. migration not applied) or after the
 * booking deadline, so it can never block the profile.
 */
export default function SponsoringBanner({ slug }: Props) {
  const router = useRouter();
  const [view, setView] = useState<CampaignView | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      fetchCampaign(slug).then((v) => { if (alive) setView(v); }).catch(() => undefined);
      return () => { alive = false; };
    }, [slug]),
  );

  if (!view || !isBookingOpen(view.campaign)) return null;
  const minPrice = view.packages.reduce<number | null>((m, p) => (m == null || p.price_cents < m ? p.price_cents : m), null);

  return (
    <PressableScale
      onPress={() => router.push(`/org/sponsoring/${slug}` as any)}
      accessibilityRole="button"
      accessibilityLabel={`${view.campaign.title}. Euren Spot ansehen`}
      scaleTo={0.98}
      style={styles.wrap}
    >
      <LinearGradient colors={[NAVY, NAVY_DEEP]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        <View style={styles.liveRow}>
          <View style={styles.liveDot} />
          <Text style={styles.eyebrow}>DanceCup Livestream · Sa 7.11.</Text>
        </View>
        <Text style={styles.title}>Euer Spot in den Pausen</Text>
        <Text style={styles.body}>
          {minPrice != null ? `Vollbild-Werbung im Livestream ab ${formatEuro(minPrice)}` : 'Vollbild-Werbung im Livestream'}
        </Text>
        <View style={styles.cta}>
          <Text style={styles.ctaText}>Euren Spot ansehen</Text>
        </View>
      </LinearGradient>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 16, marginTop: 16 },
  card: { borderRadius: 14, paddingVertical: 18, paddingHorizontal: 20, gap: 6 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF4D4F' },
  eyebrow: { fontFamily: fontFamily.medium, fontSize: 13, color: 'rgba(255,255,255,0.8)' },
  title: { fontFamily: fontFamily.heading, fontSize: 20, color: '#FFFFFF' },
  body: { fontFamily: fontFamily.regular, fontSize: 14, color: 'rgba(255,255,255,0.85)' },
  cta: {
    alignSelf: 'flex-start', marginTop: 8, paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: 999, backgroundColor: '#FFFFFF',
  },
  ctaText: { fontFamily: fontFamily.semiBold, fontSize: 14, color: NAVY },
});
