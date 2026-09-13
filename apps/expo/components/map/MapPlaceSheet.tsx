/**
 * The sheet a tapped marker opens: one place, header first (thumbnail, name,
 * category, status, address, actions), then the body — the rich org detail
 * for anything backed by an organisation account, a plain detail block
 * otherwise. Dragging the sheet up reveals the body.
 */
import React, { useMemo, useRef } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';

import { useTheme } from '@/context/ThemeContext';
import { useLocation } from '@/context/LocationContext';
import { LocationIcon, CallIcon } from '@/components/Icons';
import { fontFamily } from '@/constants/theme';
import { orgForPin, EMPTY_ORG_INDEX, type OrgIndex } from '@/lib/map/org-lookup';
import {
  getButtonLabel,
  getCategoryLabel,
  getDescription,
  getEmoji,
  getGalleryUrls,
  getImageUrl,
  getOpeningHours,
  getPhone,
  getSubtitle,
  getTitle,
  getWebsite,
  type PlaceItem,
} from '@/lib/map/place-item';
import type { OpeningHours } from '@/lib/types';
import OrgSheetDetail from './OrgSheetDetail';
import OrgPhotoCarousel from './OrgPhotoCarousel';
import PlaceStatusBadge from './PlaceStatusBadge';

export type { PlaceItem } from '@/lib/map/place-item';

type Props = {
  item: PlaceItem;
  onClose: () => void;
  /**
   * Pin → org account resolution. When the place resolves to an org, the
   * detail area shows photos, reactions and comments instead of the plain
   * body. Defaults to empty so the sheet still works without it.
   */
  orgIndex?: OrgIndex;
};

/** Handle + header block; the body waits behind a drag. */
export const PEEK_HEIGHT = 204;

const WEEKDAYS: { key: keyof OpeningHours & string; label: string }[] = [
  { key: 'monday', label: 'Montag' },
  { key: 'tuesday', label: 'Dienstag' },
  { key: 'wednesday', label: 'Mittwoch' },
  { key: 'thursday', label: 'Donnerstag' },
  { key: 'friday', label: 'Freitag' },
  { key: 'saturday', label: 'Samstag' },
  { key: 'sunday', label: 'Sonntag' },
];

export default function MapPlaceSheet({ item, onClose, orgIndex = EMPTY_ORG_INDEX }: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  const sheetRef = useRef<BottomSheet>(null);

  // The org body carries photos and a comment thread, so it needs more room
  // than the plain detail block.
  const org = orgForPin(orgIndex, item.entityType, item.id);
  const snapPoints = useMemo(() => [PEEK_HEIGHT, org ? '92%' : '75%'], [org]);

  return (
    <BottomSheet
      ref={sheetRef}
      index={0}
      snapPoints={snapPoints}
      // Composers inside the sheet must stay visible while typing.
      // 'interactive' lets the sheet ride the keyboard; a plain
      // KeyboardAvoidingView fights the sheet's pan gesture on Android.
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      enablePanDownToClose
      onClose={onClose}
      backgroundStyle={{ backgroundColor: colors.background, borderRadius: 24 }}
      handleIndicatorStyle={{ backgroundColor: colors.border, width: 44 }}
    >
      <BottomSheetScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.sheetContent}
      >
        <PlaceHeader item={item} onNavigate={() => navigate(item, router)} />

        {org ? (
          <OrgSheetDetail
            accountId={org.id}
            account={org}
            address={getSubtitle(item) || org.address}
            openingHours={org.opening_hours ?? getOpeningHours(item)}
            fallbackImageUrls={[...getGalleryUrls(item), org.cover_url, org.avatar_url]}
          />
        ) : (
          <PlaceDetail item={item} />
        )}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

/** Thumbnail, name, category + status, address, and the action row — no card
 *  around it: the sheet itself is the surface. */
function PlaceHeader({ item, onNavigate }: { item: PlaceItem; onNavigate: () => void }) {
  const { colors } = useTheme();
  const { location, hasLocationPermission, requestLocation } = useLocation();
  const imageUrl = getImageUrl(item);
  const subtitle = getSubtitle(item);

  const handleRoutePress = async () => {
    let coords = location?.coords;
    if (!coords) {
      const granted = hasLocationPermission || (await requestLocation());
      if (granted) {
        try {
          const fresh = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          coords = fresh.coords;
        } catch (err) {
          console.warn('Failed to read current location for route', err);
        }
      }
    }
    openRoute(item.lat, item.lon, coords?.latitude, coords?.longitude);
  };

  return (
    <View style={styles.header}>
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={[styles.headerImage, { backgroundColor: colors.surfaceSecondary }]}
          contentFit="cover"
          transition={120}
        />
      ) : (
        <View style={[styles.headerImage, styles.headerPlaceholder, { backgroundColor: colors.surfaceSecondary }]}>
          <Text style={styles.headerPlaceholderEmoji}>{getEmoji(item)}</Text>
        </View>
      )}
      <View style={styles.headerBody}>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
            {getTitle(item)}
          </Text>
          <View style={styles.metaRow}>
            <View style={[styles.categoryChip, { backgroundColor: colors.surface }]}>
              <Text style={[styles.categoryChipText, { color: colors.textSecondary }]}>
                {getEmoji(item)} {getCategoryLabel(item)}
              </Text>
            </View>
            <PlaceStatusBadge item={item} />
          </View>
          {subtitle ? (
            <View style={styles.metaRow}>
              <LocationIcon width={12} height={12} color={colors.textTertiary} />
              <Text style={[styles.subtitle, { color: colors.textTertiary }]} numberOfLines={1}>
                {subtitle}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.actionRow}>
          <Pressable
            style={[styles.detailsButton, { backgroundColor: colors.textPrimary }]}
            onPress={onNavigate}
          >
            <Text style={[styles.detailsButtonText, { color: colors.background }]}>
              {getButtonLabel(item)}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.routeButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={handleRoutePress}
          >
            <Text style={[styles.routeButtonText, { color: colors.textPrimary }]}>Route</Text>
          </Pressable>
          {item.entityType === 'poi' && item.data.phone ? (
            <Pressable
              style={[styles.callButton, { backgroundColor: colors.surface }]}
              onPress={() => Linking.openURL(`tel:${item.data.phone!.replace(/\s+/g, '')}`)}
            >
              <CallIcon size={16} color={colors.textPrimary} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function PlaceDetail({ item }: { item: PlaceItem }) {
  const { colors } = useTheme();
  const description = getDescription(item);
  const hours = getOpeningHours(item);
  const gallery = getGalleryUrls(item);
  const phone = getPhone(item);
  const website = getWebsite(item);

  return (
    <View style={styles.detail}>
      {gallery.length ? <OrgPhotoCarousel photos={[]} fallbackUrls={gallery} /> : null}

      {description ? (
        <Text style={[styles.detailDescription, { color: colors.textSecondary }]}>
          {description}
        </Text>
      ) : null}

      {item.entityType === 'poi' && item.data.opening_hours_de ? (
        <View style={styles.detailRow}>
          <Text style={styles.detailRowEmoji}>🕐</Text>
          <Text style={[styles.detailRowText, { color: colors.textPrimary }]}>
            {item.data.opening_hours_de}
          </Text>
        </View>
      ) : null}

      {hours ? (
        <View style={styles.hoursBlock}>
          <Text style={[styles.detailSectionTitle, { color: colors.textPrimary }]}>
            Öffnungszeiten
          </Text>
          {WEEKDAYS.map(({ key, label }) => {
            const day = hours[key];
            return (
              <View key={key} style={styles.hoursRow}>
                <Text style={[styles.hoursDay, { color: colors.textSecondary }]}>{label}</Text>
                <Text style={[styles.hoursValue, { color: colors.textPrimary }]}>
                  {!day || day.closed ? 'Geschlossen' : `${day.open} – ${day.close}`}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {phone || website ? (
        <View style={styles.contactRow}>
          {phone ? (
            <Pressable
              style={[styles.contactButton, { backgroundColor: colors.surface }]}
              onPress={() => Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`)}
            >
              <Text style={[styles.contactButtonText, { color: colors.textPrimary }]}>
                📞 Anrufen
              </Text>
            </Pressable>
          ) : null}
          {website ? (
            <Pressable
              style={[styles.contactButton, { backgroundColor: colors.surface }]}
              onPress={() => Linking.openURL(website)}
            >
              <Text style={[styles.contactButtonText, { color: colors.textPrimary }]}>
                🌐 Website
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function openRoute(destLat: number, destLon: number, originLat?: number, originLon?: number) {
  const dest = `${destLat},${destLon}`;
  const origin = originLat != null && originLon != null ? `${originLat},${originLon}` : null;
  const url =
    Platform.OS === 'ios'
      ? `maps://?daddr=${dest}&dirflg=d${origin ? `&saddr=${origin}` : ''}`
      : `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving${
          origin ? `&origin=${origin}` : ''
        }`;
  Linking.openURL(url).catch((err) => {
    console.warn('Failed to open maps app', err);
  });
}

function navigate(item: PlaceItem, router: ReturnType<typeof useRouter>) {
  switch (item.entityType) {
    case 'event':
      router.push(`/event/${item.data.id}` as any);
      break;
    case 'restaurant':
      router.push(`/restaurant/${item.data.slug}` as any);
      break;
    case 'business':
      router.push(`/business/${item.data.slug}` as any);
      break;
    case 'poi':
      router.push(`/poi/${item.data.id}` as any);
      break;
    case 'org':
      router.push({ pathname: '/account/[id]' as any, params: { id: item.data.id } });
      break;
  }
}

const styles = StyleSheet.create({
  sheetContent: { paddingTop: 4, paddingBottom: 40 },
  header: { flexDirection: 'row', gap: 14, alignItems: 'flex-start', paddingHorizontal: 16, paddingBottom: 16 },
  headerImage: { width: 96, height: 124, borderRadius: 16 },
  headerPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  headerPlaceholderEmoji: { fontSize: 36 },
  headerBody: { flex: 1, gap: 10, minHeight: 124, justifyContent: 'space-between' },
  headerText: { gap: 6 },
  title: { fontSize: 20, fontFamily: fontFamily.heading },
  subtitle: { fontSize: 12, fontFamily: fontFamily.regular, flex: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  categoryChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  categoryChipText: { fontSize: 11, fontFamily: fontFamily.medium },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailsButton: { paddingVertical: 9, paddingHorizontal: 16, borderRadius: 20 },
  detailsButtonText: { fontSize: 13, fontFamily: fontFamily.heading },
  routeButton: { paddingVertical: 9, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1 },
  routeButtonText: { fontSize: 13, fontFamily: fontFamily.heading },
  callButton: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  detail: { paddingTop: 4, gap: 14 },
  detailDescription: { fontSize: 14, fontFamily: fontFamily.regular, lineHeight: 21, paddingHorizontal: 16 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 },
  detailRowEmoji: { fontSize: 14 },
  detailRowText: { fontSize: 14, fontFamily: fontFamily.medium, flex: 1 },
  detailSectionTitle: { fontSize: 15, fontFamily: fontFamily.heading, marginBottom: 6 },
  hoursBlock: { gap: 2, paddingHorizontal: 16 },
  hoursRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  hoursDay: { fontSize: 13, fontFamily: fontFamily.regular },
  hoursValue: { fontSize: 13, fontFamily: fontFamily.medium },
  contactRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16 },
  contactButton: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12 },
  contactButtonText: { fontSize: 13, fontFamily: fontFamily.medium },
});
