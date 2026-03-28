import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { EventRecord } from '@/lib/types';
import { useBookmarks } from '@/context/BookmarksContext';
import { useTheme } from '@/context/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 32;
const SWIPE_THRESHOLD = CARD_WIDTH * 0.3;

type Props = {
  events: EventRecord[];
};

export default function HeroCards({ events }: Props) {
  const router = useRouter();
  const { isBookmarked, toggleBookmark } = useBookmarks();
  const { colors } = useTheme();
  const [currentIndex, setCurrentIndex] = useState(0);

  // Only show first 3 events for hero section
  const heroEvents = events.slice(0, 3);


  if (heroEvents.length === 0) return null;

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / CARD_WIDTH);
          setCurrentIndex(index);
        }}
        scrollEventThrottle={16}
        style={styles.scrollView}
      >
        {heroEvents.map((event, index) => {
          return (
            <View key={event.id} style={styles.cardContainer}>
              <Pressable
                onPress={() => router.push({ pathname: '/event/[id]', params: { id: event.id } })}
                style={[styles.card, { backgroundColor: colors.surface }]}
              >
                <View style={styles.imageContainer}>
                  {event.image_url ? (
                    <Image
                      source={{ uri: event.image_url }}
                      style={styles.image}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={[styles.imagePlaceholder, { backgroundColor: colors.cardPlaceholder }]} />
                  )}

                  <View style={styles.overlay} />

                  <View style={[styles.eventBadge, { backgroundColor: colors.background }]}>
                    <Text style={styles.badgeIcon}>⭐</Text>
                    <Text style={[styles.badgeText, { color: colors.textPrimary }]}>Event des Tages</Text>
                  </View>

                  <Pressable
                    onPress={() => toggleBookmark(event.id)}
                    style={styles.bookmarkBtn}
                  >
                    <MaterialIcons
                      name={isBookmarked(event.id) ? 'bookmark' : 'bookmark-border'}
                      size={24}
                      color="#ffffff"
                    />
                  </Pressable>

                  {/* Content on dark image overlay - intentionally white */}
                  <View style={styles.contentOverlay}>
                    <Text style={styles.title}>{event.title}</Text>
                    <Text style={styles.description} numberOfLines={3}>
                      {event.description || 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed diam nonumy eiusmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam voluptua.'}
                    </Text>
                    <View style={styles.locationRow}>
                      <MaterialIcons name="location-on" size={16} color="#ffffff" />
                      <Text style={styles.location}>{event.location}</Text>
                    </View>
                  </View>
                </View>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>

      {/* Page Indicators */}
      <View style={styles.indicators}>
        {heroEvents.map((_, index) => (
          <View
            key={index}
            style={[
              styles.indicator,
              index === currentIndex && styles.activeIndicator
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 400,
    marginBottom: 20,
  },
  scrollView: {
    paddingHorizontal: 16,
  },
  cardContainer: {
    width: CARD_WIDTH,
    height: 350,
    marginRight: 16,
  },
  card: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  imageContainer: {
    flex: 1,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  eventBadge: {
    position: 'absolute',
    top: 16,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  badgeIcon: {
    fontSize: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  bookmarkBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    gap: 8,
  },
  // Text on dark image overlay - intentionally hardcoded white
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
    lineHeight: 28,
  },
  description: {
    fontSize: 14,
    color: '#ffffff',
    lineHeight: 20,
    opacity: 0.9,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  location: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '500',
  },
  indicators: {
    position: 'absolute',
    bottom: -10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  activeIndicator: {
    backgroundColor: '#ffffff',
    width: 24,
  },
});
