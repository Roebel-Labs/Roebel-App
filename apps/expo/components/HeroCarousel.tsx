import React, { memo, useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, useWindowDimensions, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import type { EventRecord } from '@/lib/types';
import { useTheme } from '@/context/ThemeContext';
import { softShadow } from '@/lib/shadow';
import HeroEventCard from '@/components/HeroEventCard';
import {
  HERO_CAROUSEL_CARD_HEIGHT,
  HERO_CAROUSEL_GAP,
  activeIndexFromOffset,
  heroCarouselLayout,
} from '@/lib/hero-carousel-layout';

// Resting pose of a teased neighbour. Interpolated continuously from the
// scroll offset, so the incoming card grows into place under the finger.
const NEIGHBOUR_SCALE = 0.92;
const NEIGHBOUR_OPACITY = 0.7;

type Props = {
  events: EventRecord[];
  showPagination?: boolean;
  containerStyle?: ViewStyle;
};

/**
 * Hero variant B: the hero cards in a horizontal, center-snapping carousel
 * where the previous and next card peek in at the screen edges. Scroll
 * tracking, scaling and the active-index hop all run on the UI thread; the
 * only JS re-render is the pagination dot flip once per settled card.
 */
export default function HeroCarousel({ events, showPagination = false, containerStyle }: Props) {
  const { colors } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const layout = useMemo(() => heroCarouselLayout(screenWidth), [screenWidth]);

  const [activeIndex, setActiveIndex] = useState(0);
  const scrollX = useSharedValue(0);
  const activeIndexSV = useSharedValue(0);
  const count = events.length;

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      const x = event.contentOffset.x;
      scrollX.value = x;
      const next = activeIndexFromOffset(x, layout.interval, count);
      if (next !== activeIndexSV.value) {
        activeIndexSV.value = next;
        runOnJS(setActiveIndex)(next);
      }
    },
  });

  const renderItem = useCallback(
    ({ item, index }: { item: EventRecord; index: number }) => (
      <HeroCarouselItem
        event={item}
        index={index}
        isLast={index === count - 1}
        interval={layout.interval}
        cardWidth={layout.cardWidth}
        scrollX={scrollX}
      />
    ),
    [count, layout.interval, layout.cardWidth, scrollX]
  );

  const contentContainerStyle = useMemo(
    () => ({ paddingHorizontal: layout.sideInset }),
    [layout.sideInset]
  );

  const getItemLayout = useCallback(
    (_: ArrayLike<EventRecord> | null | undefined, index: number) => ({
      length: layout.interval,
      offset: layout.offsetForIndex(index),
      index,
    }),
    [layout]
  );

  if (count === 0) return null;

  return (
    <View style={[styles.container, containerStyle]}>
      <Animated.FlatList
        horizontal
        data={events}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        showsHorizontalScrollIndicator={false}
        // One card per swipe: snap to card+gap multiples, no momentum overshoot.
        snapToInterval={layout.interval}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        scrollEnabled={count > 1}
        contentContainerStyle={contentContainerStyle}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        // Every hero card is above the fold; render them all in one pass so
        // the peeks are never blank. Popular is capped server-side anyway.
        initialNumToRender={count}
        windowSize={3}
        removeClippedSubviews={false}
        style={styles.list}
      />

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

const keyExtractor = (event: EventRecord) => event.id;

type ItemProps = {
  event: EventRecord;
  index: number;
  isLast: boolean;
  interval: number;
  cardWidth: number;
  scrollX: SharedValue<number>;
};

const HeroCarouselItem = memo(function HeroCarouselItem({
  event,
  index,
  isLast,
  interval,
  cardWidth,
  scrollX,
}: ItemProps) {
  const router = useRouter();
  const { isDark } = useTheme();

  const animatedStyle = useAnimatedStyle(() => {
    const inputRange = [(index - 1) * interval, index * interval, (index + 1) * interval];
    return {
      transform: [
        {
          scale: interpolate(
            scrollX.value,
            inputRange,
            [NEIGHBOUR_SCALE, 1, NEIGHBOUR_SCALE],
            Extrapolation.CLAMP
          ),
        },
      ],
      opacity: interpolate(
        scrollX.value,
        inputRange,
        [NEIGHBOUR_OPACITY, 1, NEIGHBOUR_OPACITY],
        Extrapolation.CLAMP
      ),
    };
  });

  const openEvent = useCallback(() => {
    router.push({ pathname: '/event/[id]', params: { id: event.id } });
  }, [router, event.id]);

  return (
    <Animated.View
      style={[
        styles.itemWrapper,
        { width: cardWidth, marginRight: isLast ? 0 : HERO_CAROUSEL_GAP },
        softShadow(3, isDark),
        animatedStyle,
      ]}
    >
      <HeroEventCard
        event={event}
        onPress={openEvent}
        imagePriority="high"
        style={{ width: cardWidth, height: HERO_CAROUSEL_CARD_HEIGHT }}
      />
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  list: {
    overflow: 'visible',
  },
  itemWrapper: {
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
