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
  event: Pick<EventRecord, 'id' | 'title' | 'date' | 'time' | 'location' | 'image_url' | 'category'>;
};

export default function PostLinkedEventCard({ event }: Props) {
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
      style={[styles.container, { borderColor: colors.border }]}
    >
      {event.image_url ? (
        <View style={styles.imageWrapper}>
          <Image
            source={{ uri: event.image_url }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            blurRadius={20}
            accessibilityIgnoresInvertColors
          />
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
        <View style={[styles.noImageRow, { backgroundColor: colors.surfaceSecondary }]}>
          <View style={[styles.dateBadgeInline, { backgroundColor: colors.primaryLight }]}>
            <Text style={[styles.dateDay, { color: colors.primary }]}>{dateSplit.day}</Text>
            <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>{dateSplit.label}</Text>
          </View>
        </View>
      )}

      <View style={styles.info}>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
          {event.title}
        </Text>
        <View style={styles.meta}>
          {timeStr && (
            <View style={styles.metaItem}>
              <ClockIcon width={12} height={12} color={colors.textSecondary} />
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>{timeStr}</Text>
            </View>
          )}
          {location ? (
            <View style={styles.metaItem}>
              <LocationIcon width={12} height={12} color={colors.textSecondary} />
              <Text style={[styles.metaText, { color: colors.textSecondary }]} numberOfLines={1}>
                {location}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
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
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignItems: 'center',
    minWidth: 38,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  noImageRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dateBadgeInline: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignItems: 'center',
    minWidth: 38,
  },
  dateDay: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
    lineHeight: 18,
  },
  dateLabel: {
    fontSize: 10,
    fontFamily: 'Inter-Medium',
    textTransform: 'uppercase',
  },
  info: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  title: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    lineHeight: 20,
  },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metaText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
});
