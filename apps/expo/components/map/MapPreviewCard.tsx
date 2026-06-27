import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Image,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LocationIcon, CalendarIcon } from '@/components/Icons';
import { useTheme } from '@/context/ThemeContext';
import { isRestaurantOpen } from '@/lib/utils';
import { BUSINESS_CATEGORY_LABELS, ENTITY_TYPE_COLORS } from '@/lib/map/constants';
import type { EventRecord, RestaurantRecord, BusinessRecord } from '@/lib/types';
import {
  POI_TYPE_COLORS,
  POI_TYPE_LABELS_DE,
  SWIM_STATUS_COLORS,
  SWIM_STATUS_LABELS_DE,
  type PoiRecord,
} from '@/lib/supabase-pois';

export type MapPreviewData =
  | { entityType: 'event'; event: EventRecord }
  | { entityType: 'restaurant'; restaurant: RestaurantRecord }
  | { entityType: 'business'; business: BusinessRecord }
  | { entityType: 'poi'; poi: PoiRecord };

type Props = {
  data: MapPreviewData | null;
  onClose: () => void;
};

export default function MapPreviewCard({ data, onClose }: Props) {
  const router = useRouter();
  const { colors } = useTheme();
  const slideAnim = useRef(new Animated.Value(500)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (data) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 65,
          friction: 10,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 500,
          tension: 65,
          friction: 10,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [data]);

  if (!data) return null;

  const imageUrl = getImageUrl(data);
  const placeholderEmoji = getPlaceholderEmoji(data);
  const entityColor =
    data.entityType === 'poi'
      ? POI_TYPE_COLORS[data.poi.type] || '#00498B'
      : ENTITY_TYPE_COLORS[data.entityType];

  return (
    <Animated.View
      style={[
        styles.wrapper,
        {
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.card, { backgroundColor: colors.background }]}>
        <View style={styles.row}>
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={[styles.image, { backgroundColor: colors.surface }]}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.imagePlaceholder, { backgroundColor: colors.surface }]}>
              <Text style={styles.placeholderIcon}>{placeholderEmoji}</Text>
            </View>
          )}

          <View style={styles.content}>
            <View style={styles.textContainer}>
              {renderContent(data, colors, entityColor)}
            </View>

            <Pressable
              style={[styles.detailsButton, { backgroundColor: entityColor }]}
              onPress={() => handleNavigate(data, router)}
            >
              <Text style={styles.detailsButtonText}>{getButtonLabel(data)}</Text>
            </Pressable>
          </View>

          <Pressable
            style={[styles.closeButton, { backgroundColor: colors.surface }]}
            onPress={onClose}
          >
            <Text style={[styles.closeButtonText, { color: colors.textSecondary }]}>×</Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

function getImageUrl(data: MapPreviewData): string | null {
  switch (data.entityType) {
    case 'event':
      return data.event.image_url;
    case 'restaurant':
      return data.restaurant.cover_image_url || data.restaurant.logo_url;
    case 'business':
      return data.business.cover_image_url || data.business.logo_url;
    case 'poi':
      return null;
  }
}

const POI_EMOJIS: Record<string, string> = {
  toilet: '🚻',
  drinking_water: '🚰',
  bike_repair: '🔧',
  bike_rental: '🚲',
  swim_spot: '🏊',
  indoor_alternative: '🏛️',
  tourist_info: 'ℹ️',
  pharmacy: '💊',
  observation_stand: '🦅',
  viewpoint: '🌄',
};

function getPlaceholderEmoji(data: MapPreviewData): string {
  switch (data.entityType) {
    case 'event':
      return '📍';
    case 'restaurant':
      return '🍽️';
    case 'business':
      return '🏪';
    case 'poi':
      return POI_EMOJIS[data.poi.type] || '📍';
  }
}

function getButtonLabel(data: MapPreviewData): string {
  switch (data.entityType) {
    case 'event':
      return 'Details';
    case 'restaurant':
      return 'Speisekarte';
    case 'business':
      return 'Mehr erfahren';
    case 'poi':
      if (data.poi.phone) return 'Anrufen';
      if (data.poi.website) return 'Website';
      return 'Details';
  }
}

function handleNavigate(data: MapPreviewData, router: ReturnType<typeof useRouter>) {
  switch (data.entityType) {
    case 'event':
      router.push({ pathname: '/event/[id]', params: { id: data.event.id } });
      break;
    case 'restaurant':
      router.push({ pathname: '/restaurant/[slug]', params: { slug: data.restaurant.slug } });
      break;
    case 'business':
      router.push({ pathname: '/business/[slug]', params: { slug: data.business.slug } });
      break;
    case 'poi':
      if (data.poi.phone) {
        Linking.openURL(`tel:${data.poi.phone.replace(/\s+/g, '')}`);
      } else if (data.poi.website) {
        Linking.openURL(data.poi.website);
      }
      break;
  }
}

function renderContent(
  data: MapPreviewData,
  colors: any,
  entityColor: string
) {
  switch (data.entityType) {
    case 'event': {
      const { event } = data;
      return (
        <>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
            {event.title}
          </Text>
          <View style={styles.infoRow}>
            <LocationIcon width={14} height={14} color={colors.textSecondary} />
            <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
              {event.location}
            </Text>
          </View>
          {event.date && (
            <View style={styles.infoRow}>
              <CalendarIcon width={14} height={14} color={colors.textSecondary} />
              <Text style={[styles.meta, { color: colors.textTertiary }]}>
                {new Date(event.date).toLocaleDateString('de-DE', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </Text>
            </View>
          )}
        </>
      );
    }
    case 'restaurant': {
      const { restaurant } = data;
      const status = isRestaurantOpen(restaurant.opening_hours);
      return (
        <>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
            {restaurant.name}
          </Text>
          {restaurant.address && (
            <View style={styles.infoRow}>
              <LocationIcon width={14} height={14} color={colors.textSecondary} />
              <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                {restaurant.address}
              </Text>
            </View>
          )}
          <View style={styles.infoRow}>
            <View style={[styles.statusDot, { backgroundColor: status.isOpen ? '#2B9348' : '#D32F2F' }]} />
            <Text style={[styles.meta, { color: status.isOpen ? '#2B9348' : '#D32F2F' }]}>
              {status.isOpen ? 'Geöffnet' : 'Geschlossen'}
              {status.closesAt ? ` · bis ${status.closesAt}` : ''}
              {status.opensAt ? ` · öffnet ${status.opensAt}` : ''}
            </Text>
          </View>
        </>
      );
    }
    case 'business': {
      const { business } = data;
      const categoryLabel = BUSINESS_CATEGORY_LABELS[business.category] || 'Sonstiges';
      return (
        <>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
            {business.name}
          </Text>
          {business.address && (
            <View style={styles.infoRow}>
              <LocationIcon width={14} height={14} color={colors.textSecondary} />
              <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                {business.address}
              </Text>
            </View>
          )}
          <View style={styles.infoRow}>
            <View style={[styles.categoryChip, { backgroundColor: entityColor + '1A' }]}>
              <Text style={[styles.categoryChipText, { color: entityColor }]}>
                {categoryLabel}
              </Text>
            </View>
          </View>
        </>
      );
    }
    case 'poi': {
      const { poi } = data;
      const typeLabel = POI_TYPE_LABELS_DE[poi.type] || poi.type;
      const isSwimSpot = poi.type === 'swim_spot' && poi.status?.startsWith('swim_');
      const swimColor = isSwimSpot ? SWIM_STATUS_COLORS[poi.status as string] : null;
      const swimLabel = isSwimSpot ? SWIM_STATUS_LABELS_DE[poi.status as string] : null;
      return (
        <>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
            {poi.name_de}
          </Text>
          {poi.address && (
            <View style={styles.infoRow}>
              <LocationIcon width={14} height={14} color={colors.textSecondary} />
              <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                {poi.address}
              </Text>
            </View>
          )}
          {isSwimSpot && swimColor && swimLabel ? (
            <View style={styles.infoRow}>
              <View style={[styles.statusDot, { backgroundColor: swimColor }]} />
              <Text style={[styles.meta, { color: swimColor, fontFamily: 'Inter-Medium' }]}>
                {swimLabel}
              </Text>
            </View>
          ) : poi.opening_hours_de ? (
            <View style={styles.infoRow}>
              <Text style={[styles.meta, { color: colors.textTertiary }]} numberOfLines={1}>
                {poi.opening_hours_de}
              </Text>
            </View>
          ) : null}
          <View style={styles.infoRow}>
            <View style={[styles.categoryChip, { backgroundColor: entityColor + '1A' }]}>
              <Text style={[styles.categoryChipText, { color: entityColor }]}>{typeLabel}</Text>
            </View>
            {poi.is_24h && (
              <View style={[styles.categoryChip, { backgroundColor: '#00498B' + '1A', marginLeft: 6 }]}>
                <Text style={[styles.categoryChipText, { color: '#00498B' }]}>24h</Text>
              </View>
            )}
            {poi.is_pannendienst && (
              <View style={[styles.categoryChip, { backgroundColor: '#E85D04' + '1A', marginLeft: 6 }]}>
                <Text style={[styles.categoryChipText, { color: '#E85D04' }]}>Pannendienst</Text>
              </View>
            )}
          </View>
        </>
      );
    }
  }
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 140,
    left: 16,
    right: 16,
    zIndex: 1000,
  },
  backdrop: {
    position: 'absolute',
    top: -1000,
    left: -1000,
    right: -1000,
    bottom: -1000,
    backgroundColor: 'transparent',
  },
  card: {
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 12,
    padding: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  image: {
    width: 80,
    height: 80,
    borderRadius: 12,
  },
  imagePlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderIcon: {
    fontSize: 32,
  },
  content: {
    flex: 1,
    gap: 8,
  },
  textContainer: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    marginBottom: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: 'Inter',
    flex: 1,
  },
  meta: {
    fontSize: 12,
    fontFamily: 'Inter',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  categoryChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  categoryChipText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  closeButtonText: {
    fontFamily: 'MonaSansSemiCondensed-Bold',
    fontSize: 20,
    lineHeight: 20,
  },
  detailsButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  detailsButtonText: {
    fontSize: 14,
    fontFamily: 'MonaSansSemiCondensed-Bold',
    color: '#ffffff',
  },
});
