import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions, PanResponder } from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { EventRecord } from '@/lib/types';
import { useBookmarks } from '@/context/BookmarksContext';
import { useTheme } from '@/context/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 40;
const CARD_HEIGHT = 450;
const SWIPE_THRESHOLD = 120;

type Props = {
  events: EventRecord[];
};


export default function TinderHeroCards({ events }: Props) {
  const router = useRouter();
  const { isBookmarked, toggleBookmark } = useBookmarks();
  const { colors } = useTheme();
  const [currentIndex, setCurrentIndex] = useState(0);

  // Only show first 3 events for hero section
  const heroEvents = events.slice(0, 3);

  if (heroEvents.length === 0) return null;

  const nextCard = () => {
    if (currentIndex < heroEvents.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  return (
    <View style={styles.container}>
      {heroEvents.map((event, index) => {
        const isVisible = index >= currentIndex;
        const stackIndex = index - currentIndex;

        if (!isVisible || stackIndex > 2) return null;

        return (
          <TinderCard
            key={event.id}
            event={event}
            stackIndex={stackIndex}
            onSwipeComplete={nextCard}
            onPress={() => router.push({ pathname: '/event/[id]', params: { id: event.id } })}
            isBookmarked={isBookmarked(event.id)}
            onBookmark={() => toggleBookmark(event.id)}
          />
        );
      })}

      {/* Page Indicators */}
      <View style={styles.indicators}>
        {heroEvents.map((_, index) => (
          <View
            key={index}
            style={[
              styles.indicator,
              index === currentIndex && [styles.activeIndicator, { backgroundColor: colors.textSecondary }]
            ]}
          />
        ))}
      </View>
    </View>
  );
}

type CardProps = {
  event: EventRecord;
  stackIndex: number;
  onSwipeComplete: () => void;
  onPress: () => void;
  isBookmarked: boolean;
  onBookmark: () => void;
};

function TinderCard({ event, stackIndex, onSwipeComplete, onPress, isBookmarked, onBookmark }: CardProps) {
  const { colors } = useTheme();

  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: () => stackIndex === 0,
    onPanResponderMove: () => {},
    onPanResponderRelease: (evt, gestureState) => {
      if (stackIndex === 0 && Math.abs(gestureState.dx) > SWIPE_THRESHOLD) {
        setTimeout(onSwipeComplete, 200);
      }
    },
  });

  return (
    <View
      {...(stackIndex === 0 ? panResponder.panHandlers : {})}
      style={[
        styles.cardContainer,
        {
          transform: [
            { translateY: stackIndex * 8 },
            { scale: 1 - stackIndex * 0.05 }
          ],
          opacity: 1 - stackIndex * 0.3,
          zIndex: 10 - stackIndex,
        }
      ]}
    >
      <Pressable
        onPress={stackIndex === 0 ? onPress : undefined}
        style={styles.cardPressable}
      >
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
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
              <MaterialIcons name="star" size={16} color="#FFA500" />
              <Text style={[styles.badgeText, { color: colors.textPrimary }]}>Event des Tages</Text>
            </View>

            <Pressable
              onPress={onBookmark}
              style={styles.bookmarkBtn}
            >
              <MaterialIcons
                name={isBookmarked ? 'bookmark' : 'bookmark-border'}
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
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: CARD_HEIGHT + 60,
    marginBottom: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContainer: {
    position: 'absolute',
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  },
  cardPressable: {
    flex: 1,
  },
  card: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
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
    top: 20,
    left: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  bookmarkBtn: {
    position: 'absolute',
    top: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    gap: 8,
  },
  // Text on dark image overlay - intentionally hardcoded white
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#ffffff',
    lineHeight: 32,
  },
  description: {
    fontSize: 16,
    color: '#ffffff',
    lineHeight: 22,
    opacity: 0.9,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  location: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '500',
  },
  indicators: {
    position: 'absolute',
    bottom: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(55, 68, 83, 0.3)',
  },
  activeIndicator: {
    width: 24,
  },
});
