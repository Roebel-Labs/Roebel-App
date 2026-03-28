import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { formatEventCardDateSplit, formatTime, formatLocation } from '@/lib/utils';
import type { EventRecord } from '@/lib/types';

import ClockIcon from '@/assets/icons/clock.svg';
import LocationIcon from '@/assets/icons/location-small.svg';

type Props = {
  event: EventRecord;
};

export default function FeedEventCard({ event }: Props) {
  const { colors } = useTheme();
  const router = useRouter();

  const handlePress = () => {
    router.push(`/event/${event.id}` as any);
  };

  const dateSplit = formatEventCardDateSplit(event.date);
  const timeStr = formatTime(event.time);
  const location = formatLocation(event.location);

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.container,
        { backgroundColor: colors.background },
        pressed && { backgroundColor: colors.pressedOverlay },
      ]}
    >
      {/* Full-width image with date badge overlay */}
      {event.image_url ? (
        <View style={styles.imageWrapper}>
          {/* Blurred background fill */}
          <Image
            source={{ uri: event.image_url }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            blurRadius={20}
            accessibilityIgnoresInvertColors
          />
          {/* Contained image */}
          <Image
            source={{ uri: event.image_url }}
            style={styles.image}
            contentFit="contain"
            accessibilityIgnoresInvertColors
          />
          <View style={styles.dateBadge}>
            <Text style={[styles.dateDay, { color: colors.textPrimary }]}>{dateSplit.day}</Text>
            <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>{dateSplit.label}</Text>
          </View>
        </View>
      ) : (
        <View style={[styles.noImageDateRow]}>
          <View style={[styles.dateBadgeInline, { backgroundColor: colors.primaryLight }]}>
            <Text style={[styles.dateDayInline, { color: colors.primary }]}>{dateSplit.day}</Text>
            <Text style={[styles.dateLabelInline, { color: colors.textSecondary }]}>{dateSplit.label}</Text>
          </View>
        </View>
      )}

      {/* Event info */}
      <View style={styles.info}>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
          {event.title}
        </Text>
        <View style={styles.meta}>
          {timeStr && (
            <View style={styles.metaItem}>
              <ClockIcon width={13} height={13} color={colors.textSecondary} />
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>{timeStr}</Text>
            </View>
          )}
          <View style={styles.metaItem}>
            <LocationIcon width={13} height={13} color={colors.textSecondary} />
            <Text style={[styles.metaText, { color: colors.textSecondary }]} numberOfLines={1}>
              {location}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
    gap: 0,
  },
  imageWrapper: {
    position: 'relative',
    overflow: 'hidden',
    aspectRatio: 16 / 9,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  dateBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    minWidth: 44,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  dateDay: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    lineHeight: 22,
  },
  dateLabel: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    textTransform: 'uppercase',
  },
  noImageDateRow: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  dateBadgeInline: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    minWidth: 44,
  },
  dateDayInline: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    lineHeight: 20,
  },
  dateLabelInline: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
  },
  info: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 6,
  },
  title: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    lineHeight: 22,
  },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
  },
});
