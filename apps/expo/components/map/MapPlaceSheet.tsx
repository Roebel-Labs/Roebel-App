import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';

import { useTheme } from '@/context/ThemeContext';
import { useLocation } from '@/context/LocationContext';
import { LocationIcon, CalendarIcon, CallIcon } from '@/components/Icons';
import { isRestaurantOpen } from '@/lib/utils';
import { BUSINESS_CATEGORY_LABELS } from '@/lib/map/constants';
import {
  businessEmoji,
  eventEmoji,
  orgEmoji,
  poiEmoji,
  restaurantEmoji,
} from '@/lib/map/markers';
import { fontFamily } from '@/constants/theme';
import {
  SUB_TYPE_LABELS,
  type Account,
  type EventRecord,
  type RestaurantRecord,
  type BusinessRecord,
  type OpeningHours,
} from '@/lib/types';
import OrgSheetDetail from './OrgSheetDetail';
import { orgForPin, EMPTY_ORG_INDEX, type OrgIndex } from '@/lib/map/org-lookup';
import {
  POI_TYPE_LABELS_DE,
  SWIM_STATUS_COLORS,
  SWIM_STATUS_LABELS_DE,
  type PoiRecord,
} from '@/lib/supabase-pois';

export type PlaceItem =
  | { id: string; entityType: 'event'; lat: number; lon: number; data: EventRecord }
  | { id: string; entityType: 'restaurant'; lat: number; lon: number; data: RestaurantRecord }
  | { id: string; entityType: 'business'; lat: number; lon: number; data: BusinessRecord }
  | { id: string; entityType: 'poi'; lat: number; lon: number; data: PoiRecord }
  | { id: string; entityType: 'org'; lat: number; lon: number; data: Account };

type Props = {
  items: PlaceItem[];
  selectedId: string;
  onClose: () => void;
  onSelectionChange: (item: PlaceItem) => void;
  /**
   * Pin → org account resolution. When the selected place resolves to an org,
   * the detail area shows photos, reactions and comments instead of the plain
   * card body. Defaults to empty so the sheet still works without it.
   */
  orgIndex?: OrgIndex;
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 64;
const GAP = 10;
const SNAP = CARD_WIDTH + GAP;
export const PEEK_HEIGHT = 264;

const WEEKDAYS: { key: keyof OpeningHours & string; label: string }[] = [
  { key: 'monday', label: 'Montag' },
  { key: 'tuesday', label: 'Dienstag' },
  { key: 'wednesday', label: 'Mittwoch' },
  { key: 'thursday', label: 'Donnerstag' },
  { key: 'friday', label: 'Freitag' },
  { key: 'saturday', label: 'Samstag' },
  { key: 'sunday', label: 'Sonntag' },
];

export default function MapPlaceSheet({
  items,
  selectedId,
  onClose,
  onSelectionChange,
  orgIndex = EMPTY_ORG_INDEX,
}: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  const sheetRef = useRef<BottomSheet>(null);
  const listRef = useRef<FlatList<PlaceItem>>(null);

  const selectedIndex = useMemo(
    () => Math.max(0, items.findIndex((it) => it.id === selectedId)),
    [items, selectedId]
  );
  const selected = items[selectedIndex];

  const scrollX = useRef(new Animated.Value(selectedIndex * SNAP)).current;

  // The org body carries photos and a comment thread, so it needs more room
  // than the plain card's detail block.
  const selectedOrg = selected
    ? orgForPin(orgIndex, selected.entityType, selected.id)
    : null;
  const snapPoints = useMemo(
    () => [PEEK_HEIGHT, selectedOrg ? '92%' : '62%'],
    [selectedOrg]
  );

  // Keep the pager in sync when the selection comes from outside (marker tap)
  useEffect(() => {
    if (selectedIndex >= 0) {
      const timer = setTimeout(() => {
        listRef.current?.scrollToIndex({ index: selectedIndex, animated: true });
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [selectedIndex]);

  const handleMomentumEnd = useCallback(
    (e: any) => {
      const idx = Math.round(e.nativeEvent.contentOffset.x / SNAP);
      const clamped = Math.max(0, Math.min(items.length - 1, idx));
      const item = items[clamped];
      if (item && item.id !== selectedId) onSelectionChange(item);
    },
    [items, selectedId, onSelectionChange]
  );

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
        <Animated.FlatList
          ref={listRef as any}
          horizontal
          showsHorizontalScrollIndicator={false}
          data={items}
          keyExtractor={(it) => it.id}
          snapToInterval={SNAP}
          decelerationRate="fast"
          bounces
          contentContainerStyle={{ paddingHorizontal: (SCREEN_WIDTH - CARD_WIDTH) / 2 }}
          getItemLayout={(_data, index) => ({ length: SNAP, offset: SNAP * index, index })}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
            useNativeDriver: true,
          })}
          onMomentumScrollEnd={handleMomentumEnd}
          scrollEventThrottle={16}
          initialNumToRender={Math.min(items.length, 5)}
          initialScrollIndex={selectedIndex}
          renderItem={({ item, index }) => {
            const inputRange = [(index - 1) * SNAP, index * SNAP, (index + 1) * SNAP];
            const scale = scrollX.interpolate({
              inputRange,
              outputRange: [0.94, 1, 0.94],
              extrapolate: 'clamp',
            });
            const opacity = scrollX.interpolate({
              inputRange,
              outputRange: [0.7, 1, 0.7],
              extrapolate: 'clamp',
            });
            return (
              <Animated.View
                style={{ width: CARD_WIDTH, marginRight: GAP, transform: [{ scale }], opacity }}
              >
                <PlaceCard item={item} onNavigate={() => navigate(item, router)} />
              </Animated.View>
            );
          }}
        />

        {/* Revealed by dragging the sheet up */}
        {selected && selectedOrg ? (
          <OrgSheetDetail
            accountId={selectedOrg.id}
            account={selectedOrg}
            address={getSubtitle(selected) || selectedOrg.address}
            openingHours={selectedOrg.opening_hours ?? getOpeningHours(selected)}
            fallbackImageUrls={[getImageUrl(selected), selectedOrg.cover_url, selectedOrg.avatar_url]}
          />
        ) : selected ? (
          <PlaceDetail item={selected} />
        ) : null}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

function PlaceCard({ item, onNavigate }: { item: PlaceItem; onNavigate: () => void }) {
  const { colors } = useTheme();
  const { location, hasLocationPermission, requestLocation } = useLocation();
  const imageUrl = getImageUrl(item);

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
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.cardRow}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.cardImage} />
        ) : (
          <View style={[styles.cardImagePlaceholder, { backgroundColor: colors.surfaceSecondary }]}>
            <Text style={styles.cardPlaceholderEmoji}>{getEmoji(item)}</Text>
          </View>
        )}
        <View style={styles.cardContent}>
          <View style={styles.cardText}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={2}>
              {getTitle(item)}
            </Text>
            <View style={styles.metaRow}>
              <View style={[styles.categoryChip, { backgroundColor: colors.background }]}>
                <Text style={[styles.categoryChipText, { color: colors.textSecondary }]}>
                  {getEmoji(item)} {getCategoryLabel(item)}
                </Text>
              </View>
              <StatusBadge item={item} />
            </View>
            {getSubtitle(item) ? (
              <View style={styles.metaRow}>
                <LocationIcon width={12} height={12} color={colors.textTertiary} />
                <Text
                  style={[styles.cardSubtitle, { color: colors.textTertiary }]}
                  numberOfLines={1}
                >
                  {getSubtitle(item)}
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
              style={[
                styles.routeButton,
                { backgroundColor: colors.background, borderColor: colors.border },
              ]}
              onPress={handleRoutePress}
            >
              <Text style={[styles.routeButtonText, { color: colors.textPrimary }]}>Route</Text>
            </Pressable>
            {item.entityType === 'poi' && item.data.phone ? (
              <Pressable
                style={[styles.callButton, { backgroundColor: colors.background }]}
                onPress={() => Linking.openURL(`tel:${item.data.phone!.replace(/\s+/g, '')}`)}
              >
                <CallIcon size={16} color={colors.textPrimary} />
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

function StatusBadge({ item }: { item: PlaceItem }) {
  const { colors } = useTheme();
  if (
    item.entityType === 'restaurant' ||
    item.entityType === 'business' ||
    item.entityType === 'org'
  ) {
    if (!item.data.opening_hours) return null;
    const status = isRestaurantOpen(item.data.opening_hours);
    const color = status.isOpen ? '#2B9348' : '#D32F2F';
    return (
      <View style={styles.metaRow}>
        <View style={[styles.statusDot, { backgroundColor: color }]} />
        <Text style={[styles.statusText, { color }]}>
          {status.isOpen ? 'Geöffnet' : 'Geschlossen'}
        </Text>
      </View>
    );
  }
  if (item.entityType === 'event' && item.data.date) {
    return (
      <View style={styles.metaRow}>
        <CalendarIcon width={12} height={12} color={colors.textSecondary} />
        <Text style={[styles.statusText, { color: colors.textSecondary }]}>
          {new Date(item.data.date).toLocaleDateString('de-DE', {
            day: 'numeric',
            month: 'short',
          })}
        </Text>
      </View>
    );
  }
  if (item.entityType === 'poi') {
    const p = item.data;
    const isSwim = p.type === 'swim_spot' && p.status?.startsWith('swim_');
    if (isSwim && SWIM_STATUS_COLORS[p.status as string]) {
      const c = SWIM_STATUS_COLORS[p.status as string];
      return (
        <View style={styles.metaRow}>
          <View style={[styles.statusDot, { backgroundColor: c }]} />
          <Text style={[styles.statusText, { color: c }]}>
            {SWIM_STATUS_LABELS_DE[p.status as string]}
          </Text>
        </View>
      );
    }
  }
  return null;
}

function PlaceDetail({ item }: { item: PlaceItem }) {
  const { colors } = useTheme();
  const description = getDescription(item);
  const hours =
    item.entityType === 'restaurant' ||
    item.entityType === 'business' ||
    item.entityType === 'org'
      ? item.data.opening_hours
      : null;
  const gallery = item.entityType === 'business' ? item.data.gallery_images : null;
  const phone = getPhone(item);
  const website = getWebsite(item);

  return (
    <View style={styles.detail}>
      {description ? (
        <Text style={[styles.detailDescription, { color: colors.textSecondary }]}>
          {description}
        </Text>
      ) : null}

      {getSubtitle(item) ? (
        <View style={styles.detailRow}>
          <LocationIcon width={14} height={14} color={colors.textSecondary} />
          <Text style={[styles.detailRowText, { color: colors.textPrimary }]}>
            {getSubtitle(item)}
          </Text>
        </View>
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

      {gallery && gallery.length > 0 ? (
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={gallery}
          keyExtractor={(uri, i) => `${uri}-${i}`}
          contentContainerStyle={styles.galleryRow}
          renderItem={({ item: uri }) => <Image source={{ uri }} style={styles.galleryImage} />}
        />
      ) : null}
    </View>
  );
}

function getTitle(item: PlaceItem): string {
  switch (item.entityType) {
    case 'event':
      return item.data.title;
    case 'restaurant':
    case 'business':
      return item.data.name;
    case 'poi':
      return item.data.name_de;
    case 'org':
      return item.data.name;
  }
}

function getSubtitle(item: PlaceItem): string {
  switch (item.entityType) {
    case 'event':
      return item.data.location || '';
    default:
      return item.data.address || '';
  }
}

function getEmoji(item: PlaceItem): string {
  switch (item.entityType) {
    case 'event':
      return eventEmoji(item.data.category);
    case 'restaurant':
      return restaurantEmoji(item.data.slug);
    case 'business':
      return businessEmoji(item.data.slug, item.data.category);
    case 'poi':
      return poiEmoji(item.data.type);
    case 'org':
      return orgEmoji(item.data.sub_type);
  }
}

function getCategoryLabel(item: PlaceItem): string {
  switch (item.entityType) {
    case 'event':
      return item.data.category || 'Veranstaltung';
    case 'restaurant':
      return 'Gastronomie';
    case 'business':
      return BUSINESS_CATEGORY_LABELS[item.data.category] || 'Sonstiges';
    case 'poi':
      return POI_TYPE_LABELS_DE[item.data.type] || item.data.type;
    case 'org':
      return (item.data.sub_type && SUB_TYPE_LABELS[item.data.sub_type]) || 'Organisation';
  }
}

function getDescription(item: PlaceItem): string | null {
  switch (item.entityType) {
    case 'event':
      return item.data.description || null;
    case 'business':
      return item.data.description || null;
    case 'poi':
      return item.data.description_de || null;
    case 'org':
      return item.data.bio || null;
    default:
      return null;
  }
}

function getOpeningHours(item: PlaceItem): OpeningHours | null {
  switch (item.entityType) {
    case 'restaurant':
    case 'business':
    case 'org':
      return item.data.opening_hours;
    default:
      return null;
  }
}

function getPhone(item: PlaceItem): string | null {
  switch (item.entityType) {
    case 'business':
      return item.data.phone;
    case 'poi':
      return item.data.phone;
    default:
      return null;
  }
}

function getWebsite(item: PlaceItem): string | null {
  switch (item.entityType) {
    case 'business':
      return item.data.website_url;
    case 'poi':
      return item.data.website;
    default:
      return null;
  }
}

function getImageUrl(item: PlaceItem): string | null {
  switch (item.entityType) {
    case 'event':
      return item.data.image_url;
    case 'restaurant':
    case 'business':
      return item.data.cover_image_url || item.data.logo_url;
    case 'org':
      return item.data.cover_url || item.data.avatar_url;
    case 'poi':
      return null;
  }
}

function getButtonLabel(item: PlaceItem): string {
  switch (item.entityType) {
    case 'event':
      return 'Details';
    case 'restaurant':
      return 'Speisekarte';
    case 'business':
      return 'Mehr erfahren';
    case 'poi':
      return 'Details';
    case 'org':
      return 'Zum Profil';
  }
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
  sheetContent: { paddingBottom: 40 },
  card: { borderRadius: 20, padding: 12, minHeight: 148 },
  cardRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  cardImage: { width: 96, height: 124, borderRadius: 14 },
  cardImagePlaceholder: {
    width: 96,
    height: 124,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardPlaceholderEmoji: { fontSize: 36 },
  cardContent: { flex: 1, gap: 10, minHeight: 124, justifyContent: 'space-between' },
  cardText: { gap: 6 },
  cardTitle: { fontSize: 17, fontFamily: fontFamily.heading },
  cardSubtitle: { fontSize: 12, fontFamily: fontFamily.regular, flex: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  categoryChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  categoryChipText: { fontSize: 11, fontFamily: fontFamily.medium },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 12, fontFamily: fontFamily.medium },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailsButton: { paddingVertical: 9, paddingHorizontal: 16, borderRadius: 20 },
  detailsButtonText: { fontSize: 13, fontFamily: fontFamily.heading },
  routeButton: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  routeButtonText: { fontSize: 13, fontFamily: fontFamily.heading },
  callButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  detail: { paddingHorizontal: 24, paddingTop: 20, gap: 14 },
  detailDescription: { fontSize: 14, fontFamily: fontFamily.regular, lineHeight: 21 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailRowEmoji: { fontSize: 14 },
  detailRowText: { fontSize: 14, fontFamily: fontFamily.medium, flex: 1 },
  detailSectionTitle: { fontSize: 15, fontFamily: fontFamily.heading, marginBottom: 6 },
  hoursBlock: { gap: 2 },
  hoursRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  hoursDay: { fontSize: 13, fontFamily: fontFamily.regular },
  hoursValue: { fontSize: 13, fontFamily: fontFamily.medium },
  contactRow: { flexDirection: 'row', gap: 10 },
  contactButton: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12 },
  contactButtonText: { fontSize: 13, fontFamily: fontFamily.medium },
  galleryRow: { gap: 8 },
  galleryImage: { width: 110, height: 82, borderRadius: 10 },
});
