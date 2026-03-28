import React from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { BookmarkIcon, LocationSmallIcon } from './Icons';
import { BookmarkActiveSvg } from './AssetIcons';
import BookmarkSvg from '@/assets/icons/bookmark.svg';
import { EventRecord } from '@/lib/types';
import { useBookmarks } from '@/context/BookmarksContext';
import { useSnackbar } from '@/context/SnackbarContext';
import { useTheme } from '@/context/ThemeContext';
import { formatEventCardDateSplit, formatTime, formatLocation, isEventTodayOrFuture } from '@/lib/utils';

type Props = {
  events: EventRecord[];
};

export default function BookmarkedEvents({ events }: Props) {
  const { bookmarkedIds } = useBookmarks();
  const { colors } = useTheme();

  // Filter events that are bookmarked and are today or in the future
  const bookmarkedEvents = events.filter(event =>
    bookmarkedIds.has(event.id) && isEventTodayOrFuture(event.date)
  );

  if (bookmarkedEvents.length === 0) {
    // Empty state
    return (
      <View style={[styles.emptyState, { borderColor: colors.border }]}>
        <View style={styles.emptyRow}>
          <BookmarkSvg width={24} height={24} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textPrimary }]}>
            Hier erscheinen Ihre gemerkten Veranstaltungen
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
      style={styles.scrollView}
    >
      {bookmarkedEvents.map((event) => (
        <BookmarkedEventCard key={event.id} event={event} />
      ))}
    </ScrollView>
  );
}

function BookmarkedEventCard({ event }: { event: EventRecord }) {
  const router = useRouter();
  const { isBookmarked, toggleBookmark } = useBookmarks();
  const { showSnackbar } = useSnackbar();
  const { colors } = useTheme();
  const bookmarked = isBookmarked(event.id);
  const time = formatTime(event.time);
  const dateDisplay = formatEventCardDateSplit(event.date);

  const handleBookmarkToggle = async (e: any) => {
    e.stopPropagation();
    const action = await toggleBookmark(event.id);

    // Only show snackbar when removing from bookmarked section
    if (action === 'removed') {
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
          <Text style={[styles.eventTitle, { color: colors.textPrimary }]} numberOfLines={2}>
            {event.title}
          </Text>
          <Pressable
            onPress={handleBookmarkToggle}
            accessibilityRole="button"
            accessibilityLabel={bookmarked ? 'Lesezeichen entfernen' : 'Als Lesezeichen speichern'}
            style={({ pressed }) => [
              styles.bookmarkBtn,
              pressed && styles.bookmarkPressed
            ]}
          >
            {bookmarked ? (
              <BookmarkActiveSvg size={16} color={colors.primary} />
            ) : (
              <BookmarkIcon
                size={16}
                color={colors.textTertiary}
                strokeWidth={1.5}
              />
            )}
          </Pressable>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.locationRow}>
            <LocationSmallIcon color={colors.textSecondary} />
            <Text style={[styles.location, { color: colors.textPrimary }]} numberOfLines={1}>
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
  emptyState: {
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 12,
  },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    textAlign: 'left',
    flex: 1,
  },
  scrollView: {
    marginLeft: 0,
  },
  scrollContent: {
    paddingRight: 0,
    gap: 12,
  },
  card: {
    width: 240,
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
    paddingVertical: 12,
    gap: 6,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 2,
  },
  eventTitle: {
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
  location: {
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
  bookmarkBtn: {
    padding: 2,
  },
  bookmarkPressed: {
    opacity: 0.7,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
});
