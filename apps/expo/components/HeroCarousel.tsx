import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, useWindowDimensions, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import type { EventRecord } from '@/lib/types';
import { useTheme } from '@/context/ThemeContext';
import { softShadow } from '@/lib/shadow';
import HeroEventCard from '@/components/HeroEventCard';
import { transformedImageUrl } from '@/lib/image-url';
import {
  HERO_AMBIENT_MAX_OPACITY,
  HERO_CAROUSEL_CARD_HEIGHT,
  activeIndexFromOffset,
  ambientWeight,
  carouselSlots,
  heroCarouselLayout,
  snapTarget,
  wrapOffset,
} from '@/lib/hero-carousel-layout';

// Resting pose of a teased neighbour, interpolated continuously from the
// offset so the incoming card grows into place under the finger.
const NEIGHBOUR_SCALE = 0.92;
const NEIGHBOUR_OPACITY = 0.7;

// Snap spring: soft enough to glide the last stretch, damped enough to
// settle without a visible wobble. Release velocity is handed straight in
// so a flick and a slow drag both land naturally.
const SNAP_SPRING = { damping: 24, stiffness: 170, mass: 1 };

// Ambient wash behind the deck: the centred card's picture, blurred wide,
// kept quiet and bleeding a little past the stage so it melts into the page
// above and below. The peak opacity lives in the layout module because the
// cards' frost is sized against it (lib/glass-contrast.ts).
const AMBIENT_BLEED = 28;
const AMBIENT_EDGE_FADE = 56;

type Props = {
  events: EventRecord[];
  showPagination?: boolean;
  containerStyle?: ViewStyle;
};

/**
 * Hero variant B: the hero cards in an endless, center-snapping carousel
 * with the previous and next card teased at the screen edges.
 *
 * Not a FlatList: one continuous `offset` shared value drives every card
 * view, whose position wraps modulo the loop length, so the deck has no
 * ends and the only JS work per swipe is the pagination dot flip.
 */
export default function HeroCarousel({ events, showPagination = false, containerStyle }: Props) {
  const router = useRouter();
  const { colors } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const layout = useMemo(() => heroCarouselLayout(screenWidth), [screenWidth]);
  const count = events.length;
  const slots = carouselSlots(count);
  // Primitives for the worklets below — never capture the layout object
  // itself (it carries a plain function reanimated cannot ship to the UI thread).
  const interval = layout.interval;
  const loopLength = slots * interval;

  // Unbounded content offset in px. Positive = the deck has advanced.
  // Written via .set()/.get() (not .value) so the React Compiler lint does
  // not read the worklet writes as mutating a frozen hook value.
  const offset = useSharedValue(0);
  const dragStart = useSharedValue(0);
  const [activeIndex, setActiveIndex] = useState(0);

  // New data or a width change: back to the first card, mid-spring or not.
  useEffect(() => {
    cancelAnimation(offset);
    offset.set(0);
  }, [count, interval, offset]);

  useAnimatedReaction(
    () => activeIndexFromOffset(offset.value, interval, count),
    (index, previous) => {
      if (index !== previous) runOnJS(setActiveIndex)(index);
    },
    [interval, count]
  );

  // Built per render on purpose (RNGH's documented pattern): wrapping it in
  // useMemo trips the React Compiler's immutability rule on the shared-value
  // writes, and this component only re-renders on a pagination dot flip.
  const pan = Gesture.Pan()
    .enabled(count > 1)
    // Horizontal intent only; the page's vertical ScrollView keeps
    // winning an up/down drag (same thresholds as the deck swiper).
    .activeOffsetX([-10, 10])
    .failOffsetY([-10, 10])
    .onStart((e) => {
      // Activation happens ~10px into the drag: fold that distance into
      // the start so the card does not jump under the finger. A spring
      // still in flight is caught where it is.
      cancelAnimation(offset);
      dragStart.set(offset.get() + e.translationX);
    })
    .onUpdate((e) => {
      offset.set(dragStart.get() - e.translationX);
    })
    .onEnd((e) => {
      const target = snapTarget(offset.get(), -e.velocityX, interval, dragStart.get());
      offset.set(withSpring(
        target,
        { ...SNAP_SPRING, velocity: -e.velocityX },
        (finished) => {
          if (finished && loopLength > 0) {
            // Same pose, wrapped into one loop — keeps the number small
            // however long someone keeps swiping.
            offset.set(((offset.get() % loopLength) + loopLength) % loopLength);
          }
        }
      ));
    });

  const openEvent = useCallback(
    (id: string) => router.push({ pathname: '/event/[id]', params: { id } }),
    [router]
  );

  if (count === 0) return null;

  return (
    <View style={[styles.container, containerStyle]}>
      {/* Ambient backdrop: one blurred layer per slot, crossfading with the swipe. */}
      <View style={styles.ambient} pointerEvents="none">
        {Array.from({ length: slots }, (_, slot) => {
          const event = events[slot % count];
          if (!event.image_url) return null;
          return (
            <HeroAmbientLayer
              key={`ambient-${event.id}-${slot}`}
              slot={slot}
              slots={slots}
              interval={interval}
              offset={offset}
              uri={transformedImageUrl(event.image_url, { width: 64, quality: 40 }) ?? event.image_url}
            />
          );
        })}
        <LinearGradient
          colors={[colors.background, `${colors.background}00`]}
          style={[styles.ambientEdge, { top: 0 }]}
        />
        <LinearGradient
          colors={[`${colors.background}00`, colors.background]}
          style={[styles.ambientEdge, { bottom: 0 }]}
        />
      </View>

      <GestureDetector gesture={pan}>
        <Animated.View style={styles.stage}>
          {Array.from({ length: slots }, (_, slot) => {
            const event = events[slot % count];
            return (
              <HeroCarouselSlot
                key={`${event.id}-${slot}`}
                slot={slot}
                slots={slots}
                event={event}
                interval={interval}
                cardWidth={layout.cardWidth}
                sideInset={layout.sideInset}
                offset={offset}
                onPress={openEvent}
              />
            );
          })}
        </Animated.View>
      </GestureDetector>

      {showPagination && count > 1 && (
        <View style={styles.pagination} accessibilityRole="none">
          {events.map((event, index) => (
            <View
              key={event.id}
              style={[
                styles.paginationBullet,
                index === activeIndex && [
                  styles.paginationBulletActive,
                  { backgroundColor: colors.textPrimary },
                ],
              ]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

type SlotProps = {
  slot: number;
  slots: number;
  event: EventRecord;
  interval: number;
  cardWidth: number;
  sideInset: number;
  offset: SharedValue<number>;
  onPress: (id: string) => void;
};

const HeroCarouselSlot = memo(function HeroCarouselSlot({
  slot,
  slots,
  event,
  interval,
  cardWidth,
  sideInset,
  offset,
  onPress,
}: SlotProps) {
  const { isDark } = useTheme();

  const animatedStyle = useAnimatedStyle(() => {
    const loopLength = slots * interval;
    const relative = wrapOffset(slot * interval - offset.value, loopLength);
    const distance = Math.min(Math.abs(relative) / interval, 1);
    const scale = 1 - (1 - NEIGHBOUR_SCALE) * distance;
    // Scaling shrinks a neighbour toward its own centre, which would eat
    // most of the peek; pull it back inward by that amount so the full
    // PEEK stays visible at the screen edge.
    const inward = -Math.sign(relative) * (1 - scale) * (cardWidth / 2);
    return {
      transform: [{ translateX: relative + inward }, { scale }],
      opacity: 1 - (1 - NEIGHBOUR_OPACITY) * distance,
    };
  });

  const handlePress = useCallback(() => onPress(event.id), [onPress, event.id]);

  return (
    <Animated.View
      style={[
        styles.slot,
        { width: cardWidth, left: sideInset },
        softShadow(3, isDark),
        animatedStyle,
      ]}
    >
      <HeroEventCard
        event={event}
        glass
        onPress={handlePress}
        imagePriority="high"
        style={{ width: cardWidth, height: HERO_CAROUSEL_CARD_HEIGHT }}
      />
    </Animated.View>
  );
});

type AmbientLayerProps = {
  slot: number;
  slots: number;
  interval: number;
  offset: SharedValue<number>;
  uri: string;
};

const HeroAmbientLayer = memo(function HeroAmbientLayer({
  slot,
  slots,
  interval,
  offset,
  uri,
}: AmbientLayerProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const loopLength = slots * interval;
    const relative = wrapOffset(slot * interval - offset.value, loopLength);
    return { opacity: HERO_AMBIENT_MAX_OPACITY * ambientWeight(relative, interval) };
  });
  return (
    <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
      <Image
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        blurRadius={40}
        cachePolicy="memory-disk"
        recyclingKey={uri}
      />
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  ambient: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -AMBIENT_BLEED,
    bottom: -AMBIENT_BLEED,
    overflow: 'hidden',
  },
  ambientEdge: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: AMBIENT_EDGE_FADE,
  },
  stage: {
    width: '100%',
    height: HERO_CAROUSEL_CARD_HEIGHT,
    overflow: 'visible',
  },
  slot: {
    position: 'absolute',
    top: 0,
    height: HERO_CAROUSEL_CARD_HEIGHT,
    borderRadius: 24,
  },
  pagination: {
    marginTop: 14,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  paginationBullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  paginationBulletActive: {
    width: 20,
  },
});
