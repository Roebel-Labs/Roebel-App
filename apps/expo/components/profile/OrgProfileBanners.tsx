import React, { useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { DANCECUP_SLUG } from '@/lib/sponsoring';
import SponsoringBanner, { useSponsoringOpen } from '@/components/profile/SponsoringBanner';
import BadgesBanner from '@/components/profile/BadgesBanner';

const DOT = 5;

/**
 * Banners on an organisation's profile. One banner shows on its own; two or more become a paged
 * carousel with small dots below. "Abzeichen erstellen" is always there; the sponsoring campaign
 * joins while its booking is open.
 */
export default function OrgProfileBanners() {
  const router = useRouter();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const sponsoringOpen = useSponsoringOpen(DANCECUP_SLUG);
  const [page, setPage] = useState(0);

  const slides: { key: string; node: React.ReactNode }[] = [
    {
      key: 'badges',
      node: (
        <BadgesBanner
          eyebrow="Für eure Organisation"
          title="Abzeichen erstellen"
          chip="Bald verfügbar"
          onPress={() => router.push('/badges/create' as any)}
        />
      ),
    },
  ];
  if (sponsoringOpen) slides.push({ key: 'sponsoring', node: <SponsoringBanner slug={DANCECUP_SLUG} /> });

  if (slides.length === 1) return <>{slides[0].node}</>;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    if (next !== page) setPage(next);
  };

  return (
    <View>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        // Room for the cards' soft shadow (a horizontal ScrollView clips its content).
        contentContainerStyle={styles.track}
      >
        {slides.map((s) => (
          <View key={s.key} style={{ width }}>
            {s.node}
          </View>
        ))}
      </ScrollView>
      <View style={styles.dots} accessibilityLabel={`Banner ${page + 1} von ${slides.length}`}>
        {slides.map((s, i) => (
          <View key={s.key} style={[styles.dot, { backgroundColor: i === page ? colors.textPrimary : colors.border }]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { paddingBottom: 12 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 5 },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
});
