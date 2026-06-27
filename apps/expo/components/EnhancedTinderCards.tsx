import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  Animated,
  PanResponder,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { BookmarkIcon, LocationIcon } from './Icons';
import { StarSvg, BookmarkActiveSvg } from './AssetIcons';
import { useRouter } from 'expo-router';
import { EventRecord } from '@/lib/types';
import { useBookmarks } from '@/context/BookmarksContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 40;
const CARD_HEIGHT = 450;
const SWIPE_THRESHOLD = 80;
const ROTATION_FACTOR = 0.15;
const VELOCITY_THRESHOLD = 0.5;
const MAX_ROTATION = 25;

// how much the cards behind the front card peek on X axis
const PEEK_X = 16;
// how much the cards behind drop on Y axis
const PEEK_Y_1 = 15;
const PEEK_Y_2 = 30;

// Animation config for smoother transitions
const SPRING_CONFIG = {
  tension: 80,
  friction: 12,
  useNativeDriver: true,
};

const SNAP_BACK_CONFIG = {
  tension: 180,
  friction: 14,
  useNativeDriver: true,
};

type Props = { events: EventRecord[] };

export default function EnhancedTinderCards({ events }: Props) {
  const router = useRouter();
  const { isBookmarked, toggleBookmark } = useBookmarks();

  const heroEvents = events.slice(0, Math.min(3, events.length));
  const [cardOrder, setCardOrder] = useState(() =>
    Array.from({ length: heroEvents.length }, (_, i) => i)
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    setCardOrder(Array.from({ length: heroEvents.length }, (_, i) => i));
    setActiveIndex(0);
  }, [heroEvents.length]);

  if (heroEvents.length === 0) return null;

  const rotateCards = useCallback((direction: 'forward' | 'backward' = 'forward') => {
    setCardOrder(prev => {
      const next = [...prev];
      if (direction === 'forward') {
        const first = next.shift()!;
        next.push(first);
      } else {
        const last = next.pop()!;
        next.unshift(last);
      }
      return next;
    });
    setActiveIndex(prev => {
      if (direction === 'forward') {
        return (prev + 1) % heroEvents.length;
      } else {
        return prev === 0 ? heroEvents.length - 1 : prev - 1;
      }
    });
  }, [heroEvents.length]);

  return (
    <View style={styles.container}>
      {cardOrder.slice(0, 3).map((eventIndex, stackIndex) => {
        const currentEvent = heroEvents[eventIndex];
        if (!currentEvent) return null;

        return (
          <Card
            key={`${currentEvent.id}-${stackIndex}-${eventIndex}`}
            event={currentEvent}
            stackIndex={stackIndex}
            onSwipeComplete={rotateCards}
            onPress={() => {
              if (!isDragging) {
                router.push({ pathname: '/event/[id]', params: { id: currentEvent.id } });
              }
            }}
            isBookmarked={isBookmarked(currentEvent.id)}
            onBookmark={() => toggleBookmark(currentEvent.id)}
            onDragStart={() => setIsDragging(true)}
            onDragEnd={() => setIsDragging(false)}
            totalCards={heroEvents.length}
          />
        );
      })}

      <View style={styles.indicators}>
        {heroEvents.map((_, i) => (
          <Animated.View
            key={i}
            style={[styles.indicator, i === activeIndex && styles.activeIndicator]}
          />
        ))}
      </View>
    </View>
  );
}

type CardProps = {
  event: EventRecord;
  stackIndex: number;
  onSwipeComplete: (direction?: 'forward' | 'backward') => void;
  onPress: () => void;
  isBookmarked: boolean;
  onBookmark: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  totalCards: number;
};

const Card = React.memo(function Card({
  event,
  stackIndex,
  onSwipeComplete,
  onPress,
  isBookmarked,
  onBookmark,
  onDragStart,
  onDragEnd,
  totalCards,
}: CardProps) {
  // --- Animated values (created once – fixes useInsertionEffect warning) ---
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const [isAnimating, setIsAnimating] = useState(false);
  const [currentStackIndex, setCurrentStackIndex] = useState(stackIndex);
  const [hasBeenTouched, setHasBeenTouched] = useState(false);
  const lastGestureRef = useRef({ dx: 0, dy: 0 });

  // initial placement / stack look
  useEffect(() => {
    const s = stackIndex === 0 ? 1 : stackIndex === 1 ? 0.96 : 0.92;
    const o = stackIndex === 0 ? 1 : stackIndex === 1 ? 0.95 : 0.85;
    const y = stackIndex === 0 ? 0 : stackIndex === 1 ? PEEK_Y_1 : PEEK_Y_2;

    scale.setValue(s);
    opacity.setValue(o);
    translateY.setValue(y);
    translateX.setValue(0);
    rotate.setValue(0);
  }, []); // mount only

  // animate when this card's stack position changes
  useEffect(() => {
    if (isAnimating || currentStackIndex === stackIndex) return;
    setCurrentStackIndex(stackIndex);

    const targetScale = stackIndex === 0 ? 1 : stackIndex === 1 ? 0.96 : 0.92;
    const targetOpacity = stackIndex === 0 ? 1 : stackIndex === 1 ? 0.95 : 0.85;
    const targetY = stackIndex === 0 ? 0 : stackIndex === 1 ? PEEK_Y_1 : PEEK_Y_2;

    Animated.parallel([
      Animated.spring(scale, { ...SPRING_CONFIG, toValue: targetScale }),
      Animated.spring(opacity, { ...SPRING_CONFIG, toValue: targetOpacity }),
      Animated.spring(translateY, { ...SPRING_CONFIG, toValue: targetY }),
      Animated.spring(translateX, { ...SPRING_CONFIG, toValue: 0 }),
      Animated.spring(rotate, { ...SPRING_CONFIG, toValue: 0 }),
    ]).start();
  }, [stackIndex, isAnimating, currentStackIndex, scale, opacity, translateY, translateX, rotate]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => stackIndex === 0,
        onMoveShouldSetPanResponder: (_, g) => {
          // Only respond to horizontal gestures
          return stackIndex === 0 && (Math.abs(g.dx) > 5 || Math.abs(g.dy) > 5);
        },
        onPanResponderGrant: () => {
          if (stackIndex === 0) {
            setHasBeenTouched(true);
            onDragStart?.();
            // Add a subtle scale animation when touch starts
            Animated.spring(scale, {
              toValue: 1.02,
              tension: 300,
              friction: 10,
              useNativeDriver: true,
            }).start();
          }
        },
        onPanResponderMove: (_, g) => {
          if (stackIndex !== 0) return;
          
          lastGestureRef.current = { dx: g.dx, dy: g.dy };
          
          // Enhanced rotation with limits
          const rotationValue = Math.max(-MAX_ROTATION, Math.min(MAX_ROTATION, g.dx * ROTATION_FACTOR));
          
          // Dynamic scale based on drag distance
          const dragDistance = Math.sqrt(g.dx * g.dx + g.dy * g.dy);
          const scaleValue = 1 - Math.min(0.1, dragDistance / 1000);
          
          translateX.setValue(g.dx);
          translateY.setValue(g.dy * 0.8); // Reduce vertical movement
          rotate.setValue(rotationValue);
          scale.setValue(scaleValue);
          
          // Dynamic opacity based on swipe distance
          const opacityValue = Math.max(0.5, 1 - Math.abs(g.dx) / (SCREEN_WIDTH * 2));
          opacity.setValue(opacityValue);
        },
        onPanResponderRelease: (_, g) => {
          if (stackIndex !== 0) return;
          
          onDragEnd?.();
          setHasBeenTouched(false);
          
          const shouldSwipeHorizontal = Math.abs(g.dx) > SWIPE_THRESHOLD || Math.abs(g.vx) > VELOCITY_THRESHOLD;
          const swipeDirection = g.dx > 0 ? 'forward' : 'backward';
          
          if (shouldSwipeHorizontal) {
            setIsAnimating(true);
            
            // Swipe out animation
            const exitX = g.dx > 0 ? SCREEN_WIDTH : -SCREEN_WIDTH;
            const exitRotate = g.dx > 0 ? MAX_ROTATION : -MAX_ROTATION;
            
            Animated.parallel([
              Animated.timing(translateX, {
                toValue: exitX,
                duration: 200,
                useNativeDriver: true,
              }),
              Animated.timing(translateY, {
                toValue: g.dy * 2,
                duration: 200,
                useNativeDriver: true,
              }),
              Animated.timing(rotate, {
                toValue: exitRotate,
                duration: 200,
                useNativeDriver: true,
              }),
              Animated.timing(opacity, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
              }),
              Animated.timing(scale, {
                toValue: 0.8,
                duration: 200,
                useNativeDriver: true,
              }),
            ]).start(() => {
              // Reset values for when card comes back
              translateX.setValue(0);
              translateY.setValue(PEEK_Y_2);
              rotate.setValue(0);
              opacity.setValue(0.85);
              scale.setValue(0.92);
              
              setIsAnimating(false);
              onSwipeComplete(swipeDirection);
            });
          } else {
            // Snap back animation
            Animated.parallel([
              Animated.spring(translateX, { ...SNAP_BACK_CONFIG, toValue: 0 }),
              Animated.spring(translateY, { ...SNAP_BACK_CONFIG, toValue: 0 }),
              Animated.spring(rotate, { ...SNAP_BACK_CONFIG, toValue: 0 }),
              Animated.spring(scale, { ...SNAP_BACK_CONFIG, toValue: 1 }),
              Animated.spring(opacity, { ...SNAP_BACK_CONFIG, toValue: 1 }),
            ]).start();
          }
        },
        onPanResponderTerminate: () => {
          // Handle gesture interruption
          if (stackIndex === 0) {
            onDragEnd?.();
            Animated.parallel([
              Animated.spring(translateX, { ...SNAP_BACK_CONFIG, toValue: 0 }),
              Animated.spring(translateY, { ...SNAP_BACK_CONFIG, toValue: 0 }),
              Animated.spring(rotate, { ...SNAP_BACK_CONFIG, toValue: 0 }),
              Animated.spring(scale, { ...SNAP_BACK_CONFIG, toValue: 1 }),
              Animated.spring(opacity, { ...SNAP_BACK_CONFIG, toValue: 1 }),
            ]).start();
          }
        },
      }),
    [stackIndex, onSwipeComplete, translateX, translateY, rotate, opacity, scale, onDragStart, onDragEnd]
  );

  const rotateZ = useMemo(
    () =>
      rotate.interpolate({
        inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
        outputRange: ['-15deg', '0deg', '15deg'],
        extrapolate: 'clamp',
      }),
    [rotate]
  );

  // Dynamic peek for background cards based on total cards
  const staticPeekX = useMemo(() => {
    if (totalCards === 2) {
      return stackIndex === 1 ? PEEK_X * 0.8 : 0;
    }
    return stackIndex === 1 ? -PEEK_X : stackIndex === 2 ? PEEK_X : 0;
  }, [stackIndex, totalCards]);

  return (
    <Animated.View
      pointerEvents={stackIndex === 0 ? 'auto' : 'none'}
      {...(stackIndex === 0 ? panResponder.panHandlers : {})}
      style={[
        styles.cardContainer,
        {
          transform: [
            { translateX: stackIndex === 0 && !isAnimating ? translateX : staticPeekX },
            { translateY },
            { rotate: stackIndex === 0 && !isAnimating ? (rotateZ as any) : '0deg' },
            { scale },
          ],
          opacity,
          zIndex: 10 - stackIndex,
        },
      ]}
    >
      <Pressable 
        onPress={stackIndex === 0 && !hasBeenTouched ? onPress : undefined} 
        style={styles.cardPressable}
        delayLongPress={200}
      >
        <View style={styles.card}>
          <View style={styles.imageContainer}>
            {event.image_url ? (
              <Image source={{ uri: event.image_url }} style={styles.image} contentFit="cover" />
            ) : (
              <View style={styles.imagePlaceholder} />
            )}

            {/* Single gradient overlay - dark at bottom, transparent at top */}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.7)']}
              locations={[0, 1]}
              style={styles.singleGradientOverlay}
            />

            <View style={styles.eventBadge}>
              <StarSvg size={16} color="#FFD700" />
              <Text style={styles.badgeText}>Event des Tages</Text>
            </View>

            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                onBookmark();
              }}
              style={styles.bookmarkBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              {isBookmarked ? (
                <BookmarkActiveSvg size={24} color="#00498B" />
              ) : (
                <BookmarkIcon 
                  size={24}
                  color="#9ca3af"
                  strokeWidth={1.5}
                />
              )}
            </Pressable>

            <View style={styles.contentOverlay}>
              <Text style={styles.title}>{event.title}</Text>
              <Text style={styles.description} numberOfLines={3}>
                {event.description || 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed diam nonumy eiusmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam voluptua.'}
              </Text>
              <View style={styles.locationRow}>
                <LocationIcon size={16} color="#ffffff" variant="stroke" />
                <Text style={styles.location}>{event.location}</Text>
              </View>
            </View>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    height: CARD_HEIGHT + 80,
    marginBottom: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContainer: {
    position: 'absolute',
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  },
  cardPressable: { flex: 1 },
  card: {
    flex: 1,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#fff',
    // very subtle elevation so peeking cards read as separate layers
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  imageContainer: { flex: 1, position: 'relative' },
  image: { width: '100%', height: '100%' },
  imagePlaceholder: { width: '100%', height: '100%', backgroundColor: '#e5e7eb' },

  singleGradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 24, // Match card border radius
    overflow: 'hidden',
  },

  eventBadge: {
    position: 'absolute',
    top: 24,
    left: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.6)', // Dark background for white icon/text
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
    // Remove shadows as per design requirement
  },
  badgeText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#ffffff', // White text to match white icon
  },

  bookmarkBtn: {
    position: 'absolute',
    bottom: 24, // Move to bottom-right as per design
    right: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    // Remove shadows as per design requirement
  },

  contentOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 28,
    gap: 10,
  },

  title: {
    fontSize: 24, // Reduced from 28px for better proportions
    fontFamily: 'Inter-Medium',
    color: '#ffffff',
    lineHeight: 28, // Adjusted line height
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  description: {
    fontSize: 14, // Reduced from 15px for better card proportions
    fontFamily: 'Inter',
    color: '#ffffff',
    lineHeight: 20, // Adjusted line height
    opacity: 0.95,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  location: {
    fontSize: 14, // Reduced from 16px for consistency with description
    fontFamily: 'Inter-Medium',
    color: '#ffffff',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  // indicators
  indicators: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  indicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(55, 68, 83, 0.3)',
  },
  activeIndicator: {
    width: 20,
    height: 6,
    backgroundColor: '#374453',
    shadowColor: '#374453',
    shadowOpacity: 0.4,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
});