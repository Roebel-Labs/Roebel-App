import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { BookmarkIcon, LocationSmallIcon, TicketSmallIcon } from './Icons';
import { BookmarkActiveSvg } from './AssetIcons';
import { EventRecord } from '@/lib/types';
import { useBookmarks } from '@/context/BookmarksContext';
import { useSnackbar } from '@/context/SnackbarContext';
import { useTheme } from '@/context/ThemeContext';
import { currency, formatDate, formatTime, formatEventCardDateSplit, formatLocation } from '@/lib/utils';

type Props = {
  event: EventRecord;
};

export default function EventCard({ event }: Props) {
  const router = useRouter();
  const { colors } = useTheme();
  const time = formatTime(event.time);
  const { isBookmarked, toggleBookmark } = useBookmarks();
  const { showSnackbar } = useSnackbar();
  const bookmarked = isBookmarked(event.id);
  const dateDisplay = formatEventCardDateSplit(event.date);

  const handleBookmarkToggle = async (e: any) => {
    e.stopPropagation();
    const action = await toggleBookmark(event.id);

    if (action === 'added') {
      showSnackbar({
        message: 'Veranstaltung gespeichert',
        actionLabel: 'Zum Profil',
        onAction: () => router.push('/profile'),
        duration: 4000,
      });
    } else {
      showSnackbar({
        message: 'Veranstaltung entfernt',
        duration: 4000,
      });
    }
  };

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/event/[id]', params: { id: event.id } })}
      style={({ pressed }) => [styles.card, { backgroundColor: colors.background }, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Details für ${event.title} öffnen`}
    >
      <View style={styles.imageContainer}>
        {event.image_url ? (
          <Image
            source={{ uri: event.image_url }}
            style={[styles.image, { backgroundColor: colors.cardPlaceholder }]}
            contentFit="cover"
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View style={[styles.imagePlaceholder, { backgroundColor: colors.cardPlaceholder }]} />
        )}

        {/* Date overlay */}
        <View style={[styles.dateOverlay, { backgroundColor: colors.background }]}>
          <Text style={[styles.dateDay, { color: colors.textPrimary }]}>{dateDisplay.day}</Text>
          <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>{dateDisplay.label}</Text>
        </View>
      </View>

      <View style={styles.contentContainer}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{event.title}</Text>
          <Pressable
            onPress={handleBookmarkToggle}
            accessibilityRole="button"
            accessibilityLabel={bookmarked ? 'Lesezeichen entfernen' : 'Als Lesezeichen speichern'}
            style={({ pressed }) => [
              styles.bookmarkBtn,
              pressed && styles.bookmarkPressed
            ]}
            android_ripple={{ color: '#19438320', borderless: false, radius: 20 }}
          >
            {bookmarked ? (
              <BookmarkActiveSvg size={20} color={colors.primary} />
            ) : (
              <BookmarkIcon
                size={20}
                color={colors.textTertiary}
                strokeWidth={1.5}
              />
            )}
          </Pressable>
        </View>

        <Text style={[styles.description, { color: colors.textPrimary }]} numberOfLines={2}>
          {event.description || 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed diam nonumy eiusmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam voluptua.'}
        </Text>

        <View style={styles.metaRow}>
          <View style={styles.priceTag}>
            <TicketSmallIcon color={colors.textSecondary} />
            <Text style={[styles.priceText, { color: colors.textPrimary }]}>{currency(event.ticket_price)}</Text>
          </View>
          <View style={styles.locationRow}>
            <LocationSmallIcon color={colors.textSecondary} />
            <Text style={[styles.location, { color: colors.textPrimary }]}>{formatLocation(event.location)}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 32,
    overflow: 'hidden',
  },
  imageContainer: {
    height: 200,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
  },
  dateOverlay: {
    position: 'absolute',
    top: 16,
    left: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    minWidth: 48,
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
    fontSize: 18,
    fontFamily: 'Inter-Medium',
    lineHeight: 22,
  },
  dateLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    lineHeight: 14,
    marginTop: 2,
  },
  contentContainer: {
    paddingTop: 8,
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
    flex: 1,
    paddingRight: 8,
  },
  description: {
    fontSize: 14,
    fontFamily: 'Inter',
    lineHeight: 20,
    opacity: 0.7,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  priceTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  priceText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  location: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
  bookmarkBtn: {
    padding: 4,
  },
  bookmarkPressed: {
    opacity: 0.7,
  },
  pressed: { opacity: 0.9 },
});
