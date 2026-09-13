import React, { memo } from 'react';
import { View, Text, StyleSheet, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import type { EventRecord } from '@/lib/types';
import { useTheme } from '@/context/ThemeContext';
import { formatTime, formatLocation } from '@/lib/utils';
import EventCancelledScrim from '@/components/EventCancelledScrim';
import { transformedImageUrl } from '@/lib/image-url';

type Props = {
  event: EventRecord;
  /**
   * Tap on the card body. Omit to make the body inert (e.g. a deck's back
   * cards); the "Mehr erfahren" button always navigates.
   */
  onPress?: () => void;
  /** Above-the-fold hero: let expo-image fetch these before rail thumbnails. */
  imagePriority?: 'low' | 'normal' | 'high';
  style?: StyleProp<ViewStyle>;
};

/**
 * The hero event card body shared by every hero variant (deck swiper,
 * peek carousel): blurred backdrop + contained poster, day pill, title,
 * time/organizer subline, location and the "Mehr erfahren" button.
 * Sizing (width/height) comes from the parent via `style`.
 */
function HeroEventCard({ event, onPress, imagePriority = 'normal', style }: Props) {
  const router = useRouter();
  const { colors, isDark } = useTheme();

  const dayName = event.date ? format(parseISO(event.date), 'EEEE', { locale: de }) : '';

  const timeStr = formatTime(event.time);
  const sublineParts: string[] = [];
  if (timeStr) sublineParts.push(`${timeStr} Uhr`);
  if (event.organizer_name) sublineParts.push(`Von ${event.organizer_name}`);
  const subline = sublineParts.join(' • ');

  const locationText = formatLocation(event.location).toUpperCase();

  const openEvent = () => {
    router.push({ pathname: '/event/[id]', params: { id: event.id } });
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={`${event.title} öffnen`}
      style={[
        styles.card,
        {
          backgroundColor: colors.background,
          // Dark mode: the secondary border reads as a light halo around the
          // card; the base border token sits closer to the surface.
          borderColor: isDark ? colors.border : colors.borderSecondary,
        },
        style,
      ]}
    >
      {/* Image section */}
      <View style={styles.imageSection}>
        {event.image_url ? (
          <>
            {/* Blurred backdrop fills the letterbox around the contained poster */}
            <Image
              source={{ uri: transformedImageUrl(event.image_url, { width: 64, quality: 40 }) ?? undefined }}
              style={styles.blurredBg}
              contentFit="cover"
              cachePolicy="memory-disk"
              blurRadius={20}
              priority={imagePriority}
              recyclingKey={event.image_url}
            />
            <View style={styles.whiteOverlay} />
            <Image
              source={{ uri: transformedImageUrl(event.image_url, { width: 1080 }) ?? undefined }}
              style={styles.sharpImage}
              contentFit="contain"
              cachePolicy="memory-disk"
              priority={imagePriority}
              recyclingKey={event.image_url}
              transition={150}
            />
          </>
        ) : (
          <View style={[styles.imagePlaceholder, { backgroundColor: colors.cardPlaceholder }]} />
        )}

        {dayName ? (
          <View style={[styles.dayPill, { backgroundColor: colors.background }]}>
            <Text style={[styles.dayPillText, { color: colors.textPrimary }]}>{dayName}</Text>
          </View>
        ) : null}

        {event.is_cancelled && <EventCancelledScrim radius={18} />}
      </View>

      {/* Content section */}
      <View style={styles.contentSection}>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
          {event.title}
        </Text>

        {subline ? (
          <Text style={[styles.subline, { color: colors.textSecondary }]}>{subline}</Text>
        ) : null}

        <View style={[styles.divider, { backgroundColor: colors.borderSecondary }]} />

        <View style={styles.bottomRow}>
          <Text style={[styles.locationText, { color: colors.textSecondary }]} numberOfLines={2}>
            {locationText}
          </Text>

          <Pressable
            style={[styles.moreButton, { backgroundColor: colors.surfaceSecondary }]}
            onPress={(e) => {
              e.stopPropagation();
              openEvent();
            }}
            accessibilityRole="button"
            accessibilityLabel={`Mehr erfahren: ${event.title}`}
          >
            <Text style={[styles.moreButtonText, { color: colors.textPrimary }]}>Mehr erfahren</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

export default memo(HeroEventCard);

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 8,
    overflow: 'hidden',
  },
  imageSection: {
    flex: 1,
    borderRadius: 18,
    overflow: 'hidden',
    position: 'relative',
  },
  blurredBg: {
    ...StyleSheet.absoluteFill,
  },
  whiteOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  sharpImage: {
    ...StyleSheet.absoluteFill,
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
  },
  dayPill: {
    position: 'absolute',
    top: 12,
    left: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  dayPillText: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
  },
  contentSection: {
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  title: {
    fontSize: 28,
    fontFamily: 'Inter-SemiBold',
    lineHeight: 32,
    marginBottom: 6,
  },
  subline: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    marginBottom: 16,
  },
  divider: {
    height: 1,
    width: '100%',
    marginBottom: 16,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  locationText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    letterSpacing: 0.5,
    flex: 1,
    marginRight: 12,
  },
  moreButton: {
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  moreButtonText: {
    fontSize: 14,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
});
