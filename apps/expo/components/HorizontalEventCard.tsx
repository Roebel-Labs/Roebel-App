import React, { memo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { EventRecord } from '@/lib/types';
import { currency, formatEventCardWhen, formatLocation } from '@/lib/utils';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import EventInterestPeek from './EventInterestPeek';
import EventCancelledScrim from './EventCancelledScrim';
import { transformedImageUrl } from '@/lib/image-url';

import { POSTER_ASPECT_RATIO, POSTER_CARD_WIDTH, POSTER_RADIUS } from '@/constants/poster';

export { POSTER_ASPECT_RATIO, POSTER_CARD_WIDTH, POSTER_RADIUS };

type Props = {
  event: EventRecord;
  /** Stretch the card to its container width and show the image at its
   *  natural aspect ratio (no crop) instead of the fixed rail poster. */
  fullWidth?: boolean;
};

/**
 * Poster card for the explore rails ("Diese Woche", "In der Nähe", "Alle
 * Veranstaltungen") and the detail page's "Weitere Veranstaltungen": the
 * flyer tall and uncropped, then title, price · place, a relative "when"
 * line and the interest peek (avatar stack + count). No date badge, no
 * heart — interest is toggled on the detail page.
 */
function HorizontalEventCard({ event, fullWidth = false }: Props) {
  const router = useRouter();
  const { colors } = useTheme();
  const when = formatEventCardWhen(event.date, event.time);
  const place = formatLocation(event.location);
  const price = event.ticket_price == null ? null : currency(event.ticket_price);
  const priceAndPlace = [price, place].filter(Boolean).join(' · ');
  // In full-width mode we size the image container to the picture's own
  // aspect ratio so it scales up without cropping. Default to A4 until loaded.
  const [aspectRatio, setAspectRatio] = useState(POSTER_ASPECT_RATIO);

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/event/[id]', params: { id: event.id } })}
      style={({ pressed }) => [
        styles.card,
        fullWidth && styles.cardFullWidth,
        pressed && styles.cardPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Details für ${event.title} öffnen`}
    >
      <View
        style={[
          styles.poster,
          { aspectRatio: fullWidth ? aspectRatio : POSTER_ASPECT_RATIO, backgroundColor: colors.cardPlaceholder },
        ]}
      >
        {event.image_url ? (
          <Image
            source={{ uri: transformedImageUrl(event.image_url, { width: 640 }) ?? undefined }}
            style={styles.posterImage}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={event.image_url ?? undefined}
            transition={150}
            accessibilityIgnoresInvertColors
            onLoad={
              fullWidth
                ? (e) => {
                    const { width, height } = e.source;
                    if (width && height) setAspectRatio(width / height);
                  }
                : undefined
            }
          />
        ) : null}
        {event.is_cancelled && <EventCancelledScrim radius={POSTER_RADIUS} compact />}
      </View>

      <View style={styles.caption}>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
          {event.title}
        </Text>
        {priceAndPlace ? (
          <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
            {priceAndPlace}
          </Text>
        ) : null}
        <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
          {when}
        </Text>
        <EventInterestPeek eventId={event.id} style={styles.peek} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: POSTER_CARD_WIDTH,
  },
  cardFullWidth: {
    width: '100%',
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  poster: {
    width: '100%',
    borderRadius: POSTER_RADIUS,
    overflow: 'hidden',
  },
  posterImage: {
    width: '100%',
    height: '100%',
  },
  caption: {
    paddingTop: 12,
    gap: 4,
  },
  title: {
    fontSize: 17,
    lineHeight: 22,
    fontFamily: fontFamily.medium,
  },
  meta: {
    fontSize: 14,
    lineHeight: 19,
    fontFamily: fontFamily.regular,
  },
  peek: {
    marginTop: 6,
  },
});

export default memo(HorizontalEventCard);
