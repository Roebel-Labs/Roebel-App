import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  Pressable,
  Share,
  Linking,
  StyleSheet,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { ArrowLeftIcon, ShareIcon } from '@/components/Icons';
import EmbeddedMap from '@/components/map/EmbeddedMap';
import MeckyNotFound from '@/components/MeckyNotFound';
import InlineErrorBoundary from '@/components/InlineErrorBoundary';
import { ShimmerSkeleton } from '@/components/SkeletonLoader';
import {
  fetchVacationRental,
  formatEuro,
  rentalFactsLine,
  type VacationRental,
} from '@/lib/vacation-rentals';

const AMENITY_ICONS: [RegExp, keyof typeof Ionicons.glyphMap][] = [
  [/küche/i, 'restaurant-outline'],
  [/wlan|wifi/i, 'wifi-outline'],
  [/dusch|handtuch|geschirrtuch/i, 'water-outline'],
  [/klima/i, 'snow-outline'],
  [/park/i, 'car-outline'],
  [/fernseh|tv/i, 'tv-outline'],
  [/wasch/i, 'shirt-outline'],
  [/balkon|terrasse|garten/i, 'leaf-outline'],
];

function amenityIcon(label: string): keyof typeof Ionicons.glyphMap {
  return AMENITY_ICONS.find(([re]) => re.test(label))?.[1] ?? 'checkmark-circle-outline';
}

export default function VacationRentalScreen() {
  return (
    <InlineErrorBoundary label="vacation-rental">
      <VacationRentalScreenInner />
    </InlineErrorBoundary>
  );
}

function VacationRentalScreenInner() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { colors } = useTheme();
  const { data: rental, isPending } = useQuery({
    queryKey: ['vacation-rental', slug],
    queryFn: () => fetchVacationRental(slug!),
    enabled: !!slug,
  });

  if (isPending && slug) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        <ShimmerSkeleton width="100%" height={340} borderRadius={0} />
        <View style={styles.skeletonBlock}>
          <ShimmerSkeleton width="60%" height={30} />
          <ShimmerSkeleton width="80%" height={18} style={{ marginTop: 12 } as any} />
          <ShimmerSkeleton width="100%" height={80} style={{ marginTop: 24 } as any} />
        </View>
      </SafeAreaView>
    );
  }

  if (!rental) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Pressable
          onPress={() => router.back()}
          style={[styles.roundBtn, styles.notFoundBack, { backgroundColor: colors.surfaceSecondary }]}
          accessibilityRole="button"
          accessibilityLabel="Zurück"
        >
          <ArrowLeftIcon size={22} color={colors.textPrimary} />
        </Pressable>
        <MeckyNotFound title="Ferienwohnung nicht gefunden" />
      </SafeAreaView>
    );
  }

  return <RentalDetail rental={rental} />;
}

function RentalDetail({ rental }: { rental: VacationRental }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const [photoIndex, setPhotoIndex] = useState(0);
  const [descExpanded, setDescExpanded] = useState(false);
  const galleryHeight = Math.round(width * 0.9);

  const onGalleryScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      setPhotoIndex(Math.round(e.nativeEvent.contentOffset.x / width));
    },
    [width]
  );

  const share = useCallback(() => {
    const url = rental.website_url ? `\n${rental.website_url}` : '';
    Share.share({ message: `${rental.title} – ${rental.kind_label}${url}` }).catch(() => {});
  }, [rental]);

  const openRequest = () => router.push(`/ferienwohnungen/anfrage/${rental.slug}` as never);
  const host = rental.host;
  const divider = <View style={[styles.divider, { backgroundColor: colors.borderSecondary }]} />;
  const goodToKnow = [
    rental.check_in_from ? `Check-in ab ${rental.check_in_from}` : null,
    rental.check_out_until ? `Check-out bis ${rental.check_out_until}` : null,
    rental.min_nights > 1 ? `Mindestens ${rental.min_nights} Nächte` : null,
    ...rental.house_rules,
  ].filter((x): x is string => !!x);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        <View style={{ height: galleryHeight, backgroundColor: colors.surfaceSecondary }}>
          <FlatList
            horizontal
            pagingEnabled
            data={rental.images}
            keyExtractor={(uri) => uri}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onGalleryScroll}
            initialNumToRender={2}
            windowSize={3}
            renderItem={({ item, index }) => (
              <Image
                source={{ uri: item }}
                style={{ width, height: galleryHeight }}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={index === 0 ? 0 : 150}
                accessibilityLabel={`${rental.title}, Foto ${index + 1}`}
              />
            )}
          />
          {rental.images.length > 1 ? (
            <View style={styles.counter}>
              <Text style={styles.counterText}>
                {photoIndex + 1} / {rental.images.length}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{rental.title}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{rental.kind_label}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{rentalFactsLine(rental)}</Text>

          {divider}

          {host ? (
            <>
              <Pressable
                onPress={() => router.push(`/account/${host.id}` as never)}
                style={({ pressed }) => [styles.hostRow, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityLabel={`Gastgeber ${host.name} ansehen`}
              >
                {host.avatar_url ? (
                  <Image
                    source={{ uri: host.avatar_url }}
                    style={[styles.hostAvatar, { backgroundColor: colors.surfaceSecondary }]}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                ) : (
                  <View style={[styles.hostAvatar, { backgroundColor: colors.surfaceSecondary }]} />
                )}
                <View style={styles.flex}>
                  <Text style={[styles.hostName, { color: colors.textPrimary }]}>Gastgeber: {host.name}</Text>
                  <Text style={[styles.hostSub, { color: colors.textSecondary }]}>Direkt anfragen, ohne Vorauszahlung</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
              </Pressable>
              {divider}
            </>
          ) : null}

          {rental.highlights.map((h) => (
            <View key={h.title} style={styles.highlightRow}>
              <Ionicons
                name={(h.icon as keyof typeof Ionicons.glyphMap) || 'star-outline'}
                size={26}
                color={colors.textPrimary}
              />
              <View style={styles.flex}>
                <Text style={[styles.highlightTitle, { color: colors.textPrimary }]}>{h.title}</Text>
                <Text style={[styles.highlightText, { color: colors.textSecondary }]}>{h.text}</Text>
              </View>
            </View>
          ))}
          {rental.highlights.length > 0 ? divider : null}

          {rental.description ? (
            <>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Über die Wohnung</Text>
              <Text
                style={[styles.body, { color: colors.textPrimary }]}
                numberOfLines={descExpanded ? undefined : 6}
              >
                {rental.description}
              </Text>
              {!descExpanded && rental.description.length > 260 ? (
                <Pressable
                  onPress={() => setDescExpanded(true)}
                  style={[styles.greyButton, { backgroundColor: colors.surfaceSecondary }]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.greyButtonText, { color: colors.textPrimary }]}>Mehr anzeigen</Text>
                </Pressable>
              ) : null}
              {divider}
            </>
          ) : null}

          {rental.beds_label ? (
            <>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Schlafmöglichkeiten</Text>
              <View style={styles.amenityRow}>
                <Ionicons name="bed-outline" size={24} color={colors.textPrimary} />
                <Text style={[styles.amenityText, { color: colors.textPrimary }]}>{rental.beds_label}</Text>
              </View>
              {divider}
            </>
          ) : null}

          {rental.amenities.length > 0 ? (
            <>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Das bietet diese Unterkunft</Text>
              {rental.amenities.map((a) => (
                <View key={a} style={styles.amenityRow}>
                  <Ionicons name={amenityIcon(a)} size={24} color={colors.textPrimary} />
                  <Text style={[styles.amenityText, { color: colors.textPrimary }]}>{a}</Text>
                </View>
              ))}
              {divider}
            </>
          ) : null}

          {rental.latitude != null && rental.longitude != null ? (
            <>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Hier wohnst du</Text>
              {rental.address ? (
                <Text style={[styles.mapAddress, { color: colors.textSecondary }]}>{rental.address}</Text>
              ) : null}
              <View style={styles.mapWrap}>
                <EmbeddedMap
                  height={220}
                  points={[
                    { id: rental.id, lat: rental.latitude, lon: rental.longitude, emoji: '🏠', size: 'lg' },
                  ]}
                />
              </View>
              {divider}
            </>
          ) : null}

          {goodToKnow.length > 0 || rental.cancellation_policy || rental.payment_note ? (
            <>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Gut zu wissen</Text>
              {rental.cancellation_policy ? (
                <View style={styles.infoBlock}>
                  <Text style={[styles.infoTitle, { color: colors.textPrimary }]}>Stornierung</Text>
                  <Text style={[styles.infoText, { color: colors.textSecondary }]}>{rental.cancellation_policy}</Text>
                </View>
              ) : null}
              {goodToKnow.length > 0 ? (
                <View style={styles.infoBlock}>
                  <Text style={[styles.infoTitle, { color: colors.textPrimary }]}>Hausregeln</Text>
                  {goodToKnow.map((rule) => (
                    <Text key={rule} style={[styles.infoText, { color: colors.textSecondary }]}>
                      {rule}
                    </Text>
                  ))}
                </View>
              ) : null}
              {rental.payment_note ? (
                <View style={styles.infoBlock}>
                  <Text style={[styles.infoTitle, { color: colors.textPrimary }]}>Bezahlung</Text>
                  <Text style={[styles.infoText, { color: colors.textSecondary }]}>{rental.payment_note}</Text>
                </View>
              ) : null}
              {divider}
            </>
          ) : null}

          {rental.contact_phone || rental.contact_email ? (
            <>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Kontakt</Text>
              {rental.contact_phone ? (
                <Pressable
                  onPress={() => Linking.openURL(`tel:${rental.contact_phone!.replace(/\s/g, '')}`)}
                  style={styles.amenityRow}
                  accessibilityRole="link"
                >
                  <Ionicons name="call-outline" size={22} color={colors.textPrimary} />
                  <Text style={[styles.amenityText, styles.link, { color: colors.textPrimary }]}>{rental.contact_phone}</Text>
                </Pressable>
              ) : null}
              {rental.contact_email ? (
                <Pressable
                  onPress={() => Linking.openURL(`mailto:${rental.contact_email}`)}
                  style={styles.amenityRow}
                  accessibilityRole="link"
                >
                  <Ionicons name="mail-outline" size={22} color={colors.textPrimary} />
                  <Text style={[styles.amenityText, styles.link, { color: colors.textPrimary }]}>{rental.contact_email}</Text>
                </Pressable>
              ) : null}
            </>
          ) : null}
        </View>
      </ScrollView>
      <View style={[styles.topBar, { top: insets.top + 8 }]} pointerEvents="box-none">
        <Pressable
          onPress={() => router.back()}
          style={[styles.roundBtn, { backgroundColor: 'rgba(255,255,255,0.94)', borderColor: 'rgba(0,0,0,0.08)' }]}
          accessibilityRole="button"
          accessibilityLabel="Zurück"
        >
          <ArrowLeftIcon size={22} color="#000" />
        </Pressable>
        <Pressable
          onPress={share}
          style={[styles.roundBtn, { backgroundColor: 'rgba(255,255,255,0.94)', borderColor: 'rgba(0,0,0,0.08)' }]}
          accessibilityRole="button"
          accessibilityLabel="Teilen"
        >
          <ShareIcon size={20} color="#000" />
        </Pressable>
      </View>

      {rental.badge ? (
        <View style={[styles.badgeStrip, { backgroundColor: colors.surfaceSecondary }]}>
          <Ionicons name="diamond-outline" size={16} color={colors.textPrimary} />
          <Text style={[styles.badgeText, { color: colors.textPrimary }]}>
            {rental.badge}! Diese Unterkunft ist normalerweise ausgebucht.
          </Text>
        </View>
      ) : null}
      <View
        style={[
          styles.footer,
          { backgroundColor: colors.background, borderTopColor: colors.borderSecondary, paddingBottom: insets.bottom + 12 },
        ]}
      >
        <View style={styles.flex}>
          <Text style={[styles.footerPrice, { color: colors.textPrimary }]}>
            {formatEuro(rental.price_per_night)}
            <Text style={[styles.footerUnit, { color: colors.textSecondary }]}> / Nacht</Text>
          </Text>
          <Text style={[styles.footerSub, { color: colors.textSecondary }]}>Keine Vorauszahlung</Text>
        </View>
        <Pressable
          onPress={openRequest}
          style={({ pressed }) => [styles.cta, { backgroundColor: colors.primary }, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
          accessibilityLabel="Anfrage stellen"
        >
          <Text style={[styles.ctaText, { color: colors.onPrimary }]}>Anfragen</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  skeletonBlock: { padding: 24, alignItems: 'center' },
  notFoundBack: { margin: 16 },
  topBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  roundBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  counter: {
    position: 'absolute',
    right: 16,
    bottom: 40,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  counterText: { color: '#fff', fontSize: 13, fontFamily: fontFamily.semiBold },
  sheet: {
    marginTop: -24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 28,
  },
  title: { fontSize: 30, fontFamily: fontFamily.heading, textAlign: 'center' },
  subtitle: { fontSize: 15, fontFamily: fontFamily.regular, textAlign: 'center', marginTop: 4 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 24 },
  hostRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  hostAvatar: { width: 52, height: 52, borderRadius: 26 },
  hostName: { fontSize: 16, fontFamily: fontFamily.semiBold },
  hostSub: { fontSize: 14, fontFamily: fontFamily.regular, marginTop: 2 },
  highlightRow: { flexDirection: 'row', gap: 16, marginBottom: 18 },
  highlightTitle: { fontSize: 16, fontFamily: fontFamily.semiBold },
  highlightText: { fontSize: 14, fontFamily: fontFamily.regular, lineHeight: 20, marginTop: 2 },
  sectionTitle: { fontSize: 22, fontFamily: fontFamily.heading, marginBottom: 14 },
  body: { fontSize: 16, fontFamily: fontFamily.regular, lineHeight: 24 },
  greyButton: { height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  greyButtonText: { fontSize: 16, fontFamily: fontFamily.semiBold },
  amenityRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 10 },
  amenityText: { fontSize: 16, fontFamily: fontFamily.regular, flex: 1 },
  link: { textDecorationLine: 'underline' },
  mapAddress: { fontSize: 15, fontFamily: fontFamily.regular, marginTop: -6, marginBottom: 14 },
  mapWrap: { borderRadius: 16, overflow: 'hidden' },
  infoBlock: { marginBottom: 16 },
  infoTitle: { fontSize: 16, fontFamily: fontFamily.semiBold, marginBottom: 4 },
  infoText: { fontSize: 15, fontFamily: fontFamily.regular, lineHeight: 21 },
  badgeStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  badgeText: { fontSize: 13, fontFamily: fontFamily.medium, flexShrink: 1 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 24,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerPrice: { fontSize: 20, fontFamily: fontFamily.bold },
  footerUnit: { fontSize: 15, fontFamily: fontFamily.regular },
  footerSub: { fontSize: 13, fontFamily: fontFamily.regular, marginTop: 2 },
  cta: { height: 52, paddingHorizontal: 32, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 17, fontFamily: fontFamily.semiBold },
});
