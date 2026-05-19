import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { formatEventDateLong, formatLocation } from '@/lib/utils';
import type { EventRecord } from '@/lib/types';

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

  const dateLabel = formatEventDateLong(event.date);
  const location = event.location ? formatLocation(event.location) : null;

  return (
    <Pressable
      onPress={handlePress}
      style={[
        styles.container,
        { borderColor: colors.border, backgroundColor: colors.background },
      ]}
    >
      <Image
        source={event.image_url ? { uri: event.image_url } : undefined}
        style={[styles.thumbnail, { backgroundColor: colors.cardPlaceholder }]}
        contentFit="cover"
        accessibilityIgnoresInvertColors
      />
      <View style={styles.info}>
        <Text style={[styles.dateLabel, { color: colors.textSecondary }]} numberOfLines={1}>
          {dateLabel}
        </Text>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
          {event.title}
        </Text>
        {location && (
          <View style={styles.metaItem}>
            <LocationIcon width={12} height={12} color={colors.textSecondary} />
            <Text style={[styles.metaText, { color: colors.textSecondary }]} numberOfLines={1}>
              {location}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  thumbnail: {
    width: 96,
    height: 96,
  },
  info: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
    justifyContent: 'center',
  },
  dateLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
  title: {
    fontSize: 17,
    fontFamily: 'Inter-Medium',
    lineHeight: 22,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    flexShrink: 1,
  },
});
