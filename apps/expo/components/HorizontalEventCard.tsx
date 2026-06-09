import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { EventRecord } from '@/lib/types';
import { formatEventCardDateSplit, formatLocation, formatTime } from '@/lib/utils';
import { LocationSmallIcon } from './Icons';
import { useTheme } from '@/context/ThemeContext';
import InterestButton from './InterestButton';
import EventCancelledScrim from './EventCancelledScrim';

type Props = {
  event: EventRecord;
  /** Stretch the card to its container width and show the image at its
   *  natural aspect ratio (no crop) instead of the fixed carousel size. */
  fullWidth?: boolean;
};

export default function HorizontalEventCard({ event, fullWidth = false }: Props) {
  const router = useRouter();
  const { colors } = useTheme();
  const time = formatTime(event.time);
  const dateDisplay = formatEventCardDateSplit(event.date);
  // In full-width mode we size the image container to the picture's own
  // aspect ratio so it scales up without cropping. Default to 16:9 until loaded.
  const [aspectRatio, setAspectRatio] = useState(16 / 9);

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/event/[id]', params: { id: event.id } })}
      style={({ pressed }) => [
        styles.card,
        fullWidth && styles.cardFullWidth,
        { backgroundColor: colors.background },
        pressed && styles.cardPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Details für ${event.title} öffnen`}
    >
      <View style={[styles.imageContainer, fullWidth && { height: undefined, aspectRatio }]}>
        {event.image_url ? (
          <Image
            source={{ uri: event.image_url }}
            style={[styles.image, { backgroundColor: colors.cardPlaceholder }]}
            contentFit="cover"
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
        ) : (
          <View style={[styles.imagePlaceholder, { backgroundColor: colors.cardPlaceholder }]} />
        )}
        <View style={[styles.dateOverlay, { backgroundColor: colors.background }]}>
          <Text style={[styles.dateDay, { color: colors.textPrimary }]}>{dateDisplay.day}</Text>
          <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>{dateDisplay.label}</Text>
        </View>
        {event.is_cancelled && <EventCancelledScrim radius={12} compact />}
      </View>

      <View style={styles.contentContainer}>
        <View style={styles.headerRow}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={2}>
            {event.title}
          </Text>
          <InterestButton eventId={event.id} iconOnly compact />
        </View>

        <View style={styles.metaRow}>
          <View style={styles.locationRow}>
            <LocationSmallIcon color={colors.tabIconActive} />
            <Text style={[styles.locationText, { color: colors.textPrimary }]} numberOfLines={1}>
              {formatLocation(event.location)}
            </Text>
          </View>
          {time && (
            <Text style={[styles.timeText, { color: colors.textPrimary }]}>{time}</Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 240,
  },
  cardFullWidth: {
    width: '100%',
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  imageContainer: {
    height: 140,
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
  },
  dateOverlay: {
    position: 'absolute',
    top: 12,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
    minWidth: 42,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  dateDay: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    lineHeight: 20,
  },
  dateLabel: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    lineHeight: 13,
    marginTop: 1,
  },
  contentContainer: {
    paddingTop: 12,
    paddingBottom: 0,
    gap: 6,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 2,
  },
  cardTitle: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    flex: 1,
    paddingRight: 8,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flex: 1,
  },
  locationText: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    opacity: 0.7,
    flex: 1,
  },
  timeText: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    opacity: 0.7,
  },
});
