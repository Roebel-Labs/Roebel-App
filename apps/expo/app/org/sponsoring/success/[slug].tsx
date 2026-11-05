import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import BreakSpotPreview from '@/components/sponsoring/BreakSpotPreview';
import { useMySponsoring } from '@/components/sponsoring/useMySponsoring';
import { ShimmerSkeleton } from '@/components/SkeletonLoader';
import { fetchDishPhotos, type DishPhoto } from '@/lib/sponsoring';

/** Shown once right after the Stripe payment settled: the bought spot playing, then on to the status page. */
export default function SponsoringSuccessScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const s = useMySponsoring(slug);
  const [dishes, setDishes] = useState<DishPhoto[]>([]);

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (s.orgId && s.kind === 'custom') fetchDishPhotos(s.orgId).then(setDishes).catch(() => undefined);
  }, [s.orgId, s.kind]);

  const toStatus = () => router.replace(`/org/sponsoring/status/${slug}` as any);
  const share = () => {
    Share.share({ message: `Wir sind beim DanceCup-Livestream dabei! Am Samstag, 7. November, live in der Röbel App, auf YouTube und Facebook. – ${s.orgName}` }).catch(() => undefined);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: 32 + insets.bottom }]}>
        <Text style={styles.emoji}>🎉</Text>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Ihr seid dabei!</Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          {s.paidPackage
            ? `${s.orgName} läuft mit „${s.paidPackage.name}“ in den Pausen des DanceCup-Livestreams – Samstag, 7. November.`
            : 'Eure Zahlung wird noch bestätigt. Das dauert meist nur wenige Sekunden.'}
        </Text>

        {s.loading ? (
          <ShimmerSkeleton width="100%" height={Math.round(((width - 32) * 9) / 16)} borderRadius={12} />
        ) : (
          <BreakSpotPreview key={s.kind} kind={s.kind} orgName={s.orgName} logoUrl={s.orgLogo} logoColor={s.logoColor} dishes={dishes} />
        )}
        <Text style={[styles.small, { color: colors.textTertiary }]}>
          {s.kind === 'custom'
            ? 'Vorschau. Euren echten Spot schneiden wir jetzt – ihr bekommt ihn vorher zur Freigabe.'
            : 'So läuft euer Logo-Spot in jeder Pause. Die Rechnung kommt per E-Mail.'}
        </Text>

        <View style={styles.actions}>
          <Pressable onPress={toStatus} style={[styles.cta, { backgroundColor: colors.primary }]} accessibilityRole="button">
            <Text style={[styles.ctaText, { color: colors.onPrimary }]}>Status eurer Werbung</Text>
          </Pressable>
          <Pressable onPress={share} style={[styles.secondaryBtn, { borderColor: colors.border }]} accessibilityRole="button">
            <Text style={[styles.secondaryText, { color: colors.textPrimary }]}>Teilen: „Wir sind dabei“</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 16, paddingTop: 40, gap: 14 },
  emoji: { fontSize: 44, textAlign: 'center' },
  title: { fontFamily: fontFamily.heading, fontSize: 28, textAlign: 'center' },
  body: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 21, textAlign: 'center', marginBottom: 8 },
  small: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 17, textAlign: 'center' },
  actions: { gap: 10, marginTop: 12 },
  cta: { borderRadius: 999, paddingVertical: 15, alignItems: 'center' },
  ctaText: { fontFamily: fontFamily.semiBold, fontSize: 17 },
  secondaryBtn: { borderWidth: 1.5, borderRadius: 999, paddingVertical: 13, alignItems: 'center' },
  secondaryText: { fontFamily: fontFamily.semiBold, fontSize: 15 },
});
