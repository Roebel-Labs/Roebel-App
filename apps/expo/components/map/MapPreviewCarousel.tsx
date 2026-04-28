import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { useTheme } from '@/context/ThemeContext';
import { LocationIcon, CalendarIcon, CallIcon } from '@/components/Icons';
import { isRestaurantOpen } from '@/lib/utils';
import { BUSINESS_CATEGORY_LABELS } from '@/lib/map/constants';
import type { EventRecord, RestaurantRecord, BusinessRecord } from '@/lib/types';
import {
  POI_TYPE_LABELS_DE,
  SWIM_STATUS_COLORS,
  SWIM_STATUS_LABELS_DE,
  type PoiRecord,
} from '@/lib/supabase-pois';

export type CarouselItem =
  | { id: string; entityType: 'event'; lat: number; lon: number; data: EventRecord }
  | { id: string; entityType: 'restaurant'; lat: number; lon: number; data: RestaurantRecord }
  | { id: string; entityType: 'business'; lat: number; lon: number; data: BusinessRecord }
  | { id: string; entityType: 'poi'; lat: number; lon: number; data: PoiRecord };

type Props = {
  items: CarouselItem[];
  initialId: string;
  onClose: () => void;
  onSelectionChange: (item: CarouselItem) => void;
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 80; // 40px peek on each side
const GAP = 8;
const SNAP = CARD_WIDTH + GAP;

export default function MapPreviewCarousel({
  items,
  initialId,
  onClose,
  onSelectionChange,
}: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  const listRef = useRef<FlatList<CarouselItem>>(null);

  const initialIndex = useMemo(
    () => Math.max(0, items.findIndex((it) => it.id === initialId)),
    [items, initialId]
  );

  const scrollX = useRef(new Animated.Value(initialIndex * SNAP)).current;
  const slideAnim = useRef(new Animated.Value(SCREEN_WIDTH)).current;

  // Slide-up animation on mount
  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      tension: 65,
      friction: 11,
      useNativeDriver: true,
    }).start();
  }, [slideAnim]);

  // Scroll to initial index on mount
  useEffect(() => {
    if (initialIndex > 0) {
      const timer = setTimeout(() => {
        listRef.current?.scrollToIndex({ index: initialIndex, animated: false });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [initialIndex]);

  const handleMomentumEnd = (e: any) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SNAP);
    const clamped = Math.max(0, Math.min(items.length - 1, idx));
    if (items[clamped]) onSelectionChange(items[clamped]);
  };

  const handleClose = () => {
    Animated.timing(slideAnim, {
      toValue: SCREEN_WIDTH,
      duration: 220,
      useNativeDriver: true,
    }).start(() => onClose());
  };

  return (
    <Animated.View
      style={[styles.wrapper, { transform: [{ translateY: slideAnim }] }]}
      pointerEvents="box-none"
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
        getItemLayout={(_data, index) => ({
          length: SNAP,
          offset: SNAP * index,
          index,
        })}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: true }
        )}
        onMomentumScrollEnd={handleMomentumEnd}
        scrollEventThrottle={16}
        initialNumToRender={Math.min(items.length, 5)}
        renderItem={({ item, index }) => {
          const inputRange = [(index - 1) * SNAP, index * SNAP, (index + 1) * SNAP];
          const scale = scrollX.interpolate({
            inputRange,
            outputRange: [0.92, 1, 0.92],
            extrapolate: 'clamp',
          });
          const opacity = scrollX.interpolate({
            inputRange,
            outputRange: [0.7, 1, 0.7],
            extrapolate: 'clamp',
          });
          return (
            <Animated.View
              style={{
                width: CARD_WIDTH,
                marginRight: GAP,
                transform: [{ scale }],
                opacity,
              }}
            >
              <Card
                item={item}
                colors={colors}
                onClose={handleClose}
                onNavigate={() => navigate(item, router)}
              />
            </Animated.View>
          );
        }}
      />
    </Animated.View>
  );
}

function Card({
  item,
  colors,
  onClose,
  onNavigate,
}: {
  item: CarouselItem;
  colors: any;
  onClose: () => void;
  onNavigate: () => void;
}) {
  const imageUrl = getImageUrl(item);

  return (
    <View style={[styles.card, { backgroundColor: colors.background }]}>
      <View style={styles.row}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.image} />
        ) : (
          <View style={[styles.imagePlaceholder, { backgroundColor: colors.surface }]}>
            <Text style={styles.placeholderEmoji}>{getPlaceholderEmoji(item)}</Text>
          </View>
        )}

        <View style={styles.content}>
          <View style={styles.textContainer}>{renderInfo(item, colors)}</View>

          <View style={styles.actionRow}>
            <Pressable
              style={[styles.detailsButton, { backgroundColor: '#000000' }]}
              onPress={onNavigate}
            >
              <Text style={styles.detailsButtonText}>{getButtonLabel(item)}</Text>
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

        <Pressable
          style={[styles.closeButton, { backgroundColor: colors.surface }]}
          onPress={onClose}
        >
          <Text style={[styles.closeButtonText, { color: colors.textSecondary }]}>×</Text>
        </Pressable>
      </View>
    </View>
  );
}

function renderInfo(item: CarouselItem, colors: any) {
  switch (item.entityType) {
    case 'event': {
      const e = item.data;
      return (
        <>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
            {e.title}
          </Text>
          {e.location ? (
            <View style={styles.metaRow}>
              <LocationIcon width={12} height={12} color={colors.textSecondary} />
              <Text
                style={[styles.subtitle, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                {e.location}
              </Text>
            </View>
          ) : null}
          {e.date ? (
            <View style={styles.metaRow}>
              <CalendarIcon width={12} height={12} color={colors.textSecondary} />
              <Text style={[styles.meta, { color: colors.textTertiary }]}>
                {new Date(e.date).toLocaleDateString('de-DE', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </Text>
            </View>
          ) : null}
        </>
      );
    }
    case 'restaurant': {
      const r = item.data;
      const status = isRestaurantOpen(r.opening_hours);
      return (
        <>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
            {r.name}
          </Text>
          {r.address ? (
            <View style={styles.metaRow}>
              <LocationIcon width={12} height={12} color={colors.textSecondary} />
              <Text
                style={[styles.subtitle, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                {r.address}
              </Text>
            </View>
          ) : null}
          <View style={styles.metaRow}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: status.isOpen ? '#2B9348' : '#D32F2F' },
              ]}
            />
            <Text style={[styles.meta, { color: status.isOpen ? '#2B9348' : '#D32F2F' }]}>
              {status.isOpen ? 'Geöffnet' : 'Geschlossen'}
            </Text>
          </View>
        </>
      );
    }
    case 'business': {
      const b = item.data;
      const cat = BUSINESS_CATEGORY_LABELS[b.category] || 'Sonstiges';
      return (
        <>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
            {b.name}
          </Text>
          {b.address ? (
            <View style={styles.metaRow}>
              <LocationIcon width={12} height={12} color={colors.textSecondary} />
              <Text
                style={[styles.subtitle, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                {b.address}
              </Text>
            </View>
          ) : null}
          <View style={styles.metaRow}>
            <View style={[styles.categoryChip, { backgroundColor: '#F3F4F6' }]}>
              <Text style={[styles.categoryChipText, { color: '#374453' }]}>{cat}</Text>
            </View>
          </View>
        </>
      );
    }
    case 'poi': {
      const p = item.data;
      const typeLabel = POI_TYPE_LABELS_DE[p.type] || p.type;
      const isSwim = p.type === 'swim_spot' && p.status?.startsWith('swim_');
      const swimColor = isSwim ? SWIM_STATUS_COLORS[p.status as string] : null;
      const swimLabel = isSwim ? SWIM_STATUS_LABELS_DE[p.status as string] : null;
      return (
        <>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
            {p.name_de}
          </Text>
          {p.address ? (
            <View style={styles.metaRow}>
              <LocationIcon width={12} height={12} color={colors.textSecondary} />
              <Text
                style={[styles.subtitle, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                {p.address}
              </Text>
            </View>
          ) : null}
          {isSwim && swimColor && swimLabel ? (
            <View style={styles.metaRow}>
              <View style={[styles.statusDot, { backgroundColor: swimColor }]} />
              <Text style={[styles.meta, { color: swimColor, fontFamily: 'Inter-Medium' }]}>
                {swimLabel}
              </Text>
            </View>
          ) : p.opening_hours_de ? (
            <View style={styles.metaRow}>
              <Text style={[styles.meta, { color: colors.textTertiary }]} numberOfLines={1}>
                {p.opening_hours_de}
              </Text>
            </View>
          ) : null}
          <View style={styles.metaRow}>
            <View style={[styles.categoryChip, { backgroundColor: '#F3F4F6' }]}>
              <Text style={[styles.categoryChipText, { color: '#374453' }]}>{typeLabel}</Text>
            </View>
            {p.is_24h ? (
              <View style={[styles.categoryChip, { backgroundColor: '#194383' + '1A', marginLeft: 6 }]}>
                <Text style={[styles.categoryChipText, { color: '#194383' }]}>24h</Text>
              </View>
            ) : null}
            {p.is_pannendienst ? (
              <View style={[styles.categoryChip, { backgroundColor: '#E85D04' + '1A', marginLeft: 6 }]}>
                <Text style={[styles.categoryChipText, { color: '#E85D04' }]}>Pannendienst</Text>
              </View>
            ) : null}
          </View>
        </>
      );
    }
  }
}

function getImageUrl(item: CarouselItem): string | null {
  switch (item.entityType) {
    case 'event':
      return item.data.image_url;
    case 'restaurant':
      return item.data.cover_image_url || item.data.logo_url;
    case 'business':
      return item.data.cover_image_url || item.data.logo_url;
    case 'poi':
      return null;
  }
}

function getPlaceholderEmoji(item: CarouselItem): string {
  switch (item.entityType) {
    case 'event':
      return '📅';
    case 'restaurant':
      return '🍽';
    case 'business':
      return '🏪';
    case 'poi':
      return '⭐';
  }
}

function getButtonLabel(item: CarouselItem): string {
  switch (item.entityType) {
    case 'event':
      return 'Details';
    case 'restaurant':
      return 'Speisekarte';
    case 'business':
      return 'Mehr erfahren';
    case 'poi':
      return 'Details';
  }
}

function navigate(item: CarouselItem, router: ReturnType<typeof useRouter>) {
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
  }
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    zIndex: 1000,
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
  placeholderEmoji: { fontSize: 32 },
  content: { flex: 1, gap: 8 },
  textContainer: { flex: 1, gap: 4 },
  title: { fontSize: 15, fontFamily: 'Inter-SemiBold', marginBottom: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  subtitle: { fontSize: 12, fontFamily: 'Inter-Regular', flex: 1 },
  meta: { fontSize: 12, fontFamily: 'Inter-Regular' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  categoryChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  categoryChipText: { fontSize: 11, fontFamily: 'Inter-Medium' },
  closeButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  closeButtonText: { fontSize: 18, lineHeight: 18 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailsButton: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8 },
  detailsButtonText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: '#ffffff',
  },
  callButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
