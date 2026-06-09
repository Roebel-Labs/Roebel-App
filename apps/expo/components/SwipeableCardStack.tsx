import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { EventRecord } from '@/lib/types';
import { useTheme } from '@/context/ThemeContext';
import { formatTime, formatLocation } from '@/lib/utils';
import { softShadow } from '@/lib/shadow';
import EventCancelledScrim from '@/components/EventCancelledScrim';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const CARD_WIDTH = SCREEN_WIDTH - 40;
const CARD_HEIGHT = 520;

// EffectCards parameters
const SLIDE_OFFSET_Y = 8;
const SLIDE_OFFSET_X = 30;
const ROTATE_SLIDE_OFFSET = 2;
const SLIDES_PER_VIEW = 3;
const SWIPE_THRESHOLD = 100;

type Props = {
  events: EventRecord[];
  showPagination?: boolean;
  loop?: boolean;
  spaceBetween?: number;
  containerStyle?: ViewStyle;
};

export default function SwipeableCardStack({
  events,
  showPagination = false,
  loop = true,
  spaceBetween = 40,
  containerStyle,
}: Props) {
  const { colors } = useTheme();
  const [activeIndex, setActiveIndex] = useState(0);
  const progress = useSharedValue(0);

  const containerOpacity = useSharedValue(0);
  const containerTranslateY = useSharedValue(20);

  useEffect(() => {
    setTimeout(() => {
      containerOpacity.value = withTiming(1, {
        duration: 300,
        easing: Easing.out(Easing.ease),
      });
      containerTranslateY.value = withTiming(0, {
        duration: 300,
        easing: Easing.out(Easing.ease),
      });
    }, 500);
  }, []);

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
    transform: [{ translateY: containerTranslateY.value }],
  }));

  const prevActiveIndexRef = useRef(activeIndex);

  const slideNext = () => {
    setActiveIndex((prev) => (prev + 1) % events.length);
  };

  // Reset progress in the render body so it syncs with slideIndex prop updates
  if (prevActiveIndexRef.current !== activeIndex) {
    progress.value = 0;
    prevActiveIndexRef.current = activeIndex;
  }

  if (events.length === 0) return null;

  return (
    <Animated.View style={[styles.container, containerStyle, containerAnimatedStyle]}>
      <View style={styles.swiperContainer}>
        <View style={styles.swiperWrapper}>
          {events.map((event, index) => {
            const slideIndex = (index - activeIndex + events.length) % events.length;
            if (slideIndex >= SLIDES_PER_VIEW) return null;

            return (
              <SwiperSlide
                key={`${event.id}-${index}`}
                event={event}
                slideIndex={slideIndex}
                isActive={slideIndex === 0}
                progress={progress}
                onSlideNext={slideNext}
                totalSlides={events.length}
              />
            );
          })}
        </View>

        {showPagination && (
          <View style={styles.swiperPagination}>
            {events.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.swiperPaginationBullet,
                  index === activeIndex && [styles.swiperPaginationBulletActive, { backgroundColor: colors.textPrimary }],
                ]}
              />
            ))}
          </View>
        )}
      </View>
    </Animated.View>
  );
}

type SwiperSlideProps = {
  event: EventRecord;
  slideIndex: number;
  isActive: boolean;
  progress: Animated.SharedValue<number>;
  onSlideNext: () => void;
  totalSlides: number;
};

function SwiperSlide({
  event,
  slideIndex,
  isActive,
  progress,
  onSlideNext,
  totalSlides,
}: SwiperSlideProps) {
  const router = useRouter();
  const { colors, isDark } = useTheme();

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const isSwipedOut = useSharedValue(false);

  // Sync slideIndex to a shared value so the worklet reacts immediately
  const slideIndexSV = useSharedValue(slideIndex);
  slideIndexSV.value = slideIndex;

  // Derive day name from event date
  const dayName = event.date
    ? format(parseISO(event.date), 'EEEE', { locale: de })
    : '';

  // Format time + organizer subline
  const timeStr = formatTime(event.time);
  const sublineParts: string[] = [];
  if (timeStr) sublineParts.push(`${timeStr} Uhr`);
  if (event.organizer_name) sublineParts.push(`Von ${event.organizer_name}`);
  const subline = sublineParts.join(' • ');

  // Location in uppercase
  const locationText = formatLocation(event.location).toUpperCase();

  useEffect(() => {
    if (!isActive) {
      translateX.value = 0;
      translateY.value = 0;
      isSwipedOut.value = false;
    }
  }, [isActive]);

  const gesture = Gesture.Pan()
    .enabled(isActive)
    .activeOffsetX([-10, 10])
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = 0;
      const dist = Math.abs(e.translationX);
      progress.value = Math.min(dist / 200, 1);
    })
    .onEnd((e) => {
      const dist = Math.abs(e.translationX);
      const shouldSwipe = dist > SWIPE_THRESHOLD;

      if (shouldSwipe) {
        const direction = e.translationX > 0 ? 1 : -1;
        translateX.value = withTiming(
          direction * SCREEN_WIDTH * 1.5,
          { duration: 300, easing: Easing.out(Easing.ease) },
          (finished) => {
            if (finished) {
              isSwipedOut.value = true;
              runOnJS(onSlideNext)();
            }
          }
        );
        translateY.value = withTiming(0, {
          duration: 300,
          easing: Easing.out(Easing.ease),
        });
        progress.value = withTiming(1, { duration: 300 });
      } else {
        translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
        translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
        progress.value = withSpring(0, { damping: 20, stiffness: 200 });
      }
    });

  const animatedStyle = useAnimatedStyle(() => {
    const si = slideIndexSV.value;

    if (isSwipedOut.value) {
      return {
        transform: [
          { translateX: translateX.value },
          { translateY: translateY.value },
          { scale: 0.8 },
        ],
        zIndex: -1,
        opacity: 0,
      };
    }

    if (si === 0) {
      const rotate = (translateX.value / CARD_WIDTH) * 20;
      const swipeDistance = Math.sqrt(translateX.value ** 2 + translateY.value ** 2);
      const scale = interpolate(swipeDistance, [0, 200], [1, 0.8], 'clamp');

      return {
        transform: [
          { translateX: translateX.value },
          { translateY: translateY.value },
          { scale },
          { rotateZ: `${rotate}deg` },
        ],
        zIndex: 10,
        opacity: 1,
      };
    } else if (si === 1) {
      const offsetY = si * SLIDE_OFFSET_Y;
      const offsetX = -SLIDE_OFFSET_X;
      const rotateOffset = -si * ROTATE_SLIDE_OFFSET;

      const currentOffsetY = interpolate(progress.value, [0, 1], [-offsetY, 0]);
      const currentOffsetX = interpolate(progress.value, [0, 1], [offsetX, 0]);
      const currentScale = interpolate(progress.value, [0, 1], [0.92, 1]);
      const currentRotate = interpolate(progress.value, [0, 1], [rotateOffset, 0]);

      return {
        transform: [
          { translateX: currentOffsetX },
          { translateY: currentOffsetY },
          { scale: currentScale },
          { rotateZ: `${currentRotate}deg` },
        ],
        zIndex: 9,
        opacity: 1,
      };
    } else {
      const offsetY = si * SLIDE_OFFSET_Y;
      const offsetX = SLIDE_OFFSET_X;
      const rotateOffset = si * ROTATE_SLIDE_OFFSET;

      const currentOffsetY = interpolate(progress.value, [0, 1], [-offsetY, -SLIDE_OFFSET_Y]);
      const currentOffsetX = interpolate(progress.value, [0, 1], [offsetX, -SLIDE_OFFSET_X]);
      const currentScale = interpolate(progress.value, [0, 1], [0.84, 0.92]);
      const currentRotate = interpolate(progress.value, [0, 1], [rotateOffset, -ROTATE_SLIDE_OFFSET]);

      return {
        transform: [
          { translateX: currentOffsetX },
          { translateY: currentOffsetY },
          { scale: currentScale },
          { rotateZ: `${currentRotate}deg` },
        ],
        zIndex: 8,
        opacity: 1,
      };
    }
  });

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[
          styles.cardWrapper,
          animatedStyle,
          slideIndex === 0 && softShadow(3, isDark),
        ]}
      >
        <Pressable
          onPress={() => {
            if (isActive) {
              router.push({
                pathname: '/event/[id]',
                params: { id: event.id },
              });
            }
          }}
          style={[styles.card, { backgroundColor: colors.background, borderColor: colors.borderSecondary }]}
        >
          {/* Image Section */}
          <View style={styles.imageSection}>
            {event.image_url ? (
              <>
                {/* Blurred background */}
                <Image
                  source={{ uri: event.image_url }}
                  style={styles.blurredBg}
                  contentFit="cover"
                  blurRadius={20}
                />
                {/* 20% white overlay */}
                <View style={styles.whiteOverlay} />
                {/* Sharp event image */}
                <Image
                  source={{ uri: event.image_url }}
                  style={styles.sharpImage}
                  contentFit="contain"
                />
              </>
            ) : (
              <View style={[styles.imagePlaceholder, { backgroundColor: colors.cardPlaceholder }]} />
            )}

            {/* Day pill */}
            {dayName ? (
              <View style={[styles.dayPill, { backgroundColor: colors.background }]}>
                <Text style={[styles.dayPillText, { color: colors.textPrimary }]}>{dayName}</Text>
              </View>
            ) : null}

            {event.is_cancelled && <EventCancelledScrim radius={18} />}
          </View>

          {/* Content Section */}
          <View style={styles.contentSection}>
            <Text
              style={[styles.title, { color: colors.textPrimary }]}
              numberOfLines={2}
            >
              {event.title}
            </Text>

            {subline ? (
              <Text style={[styles.subline, { color: colors.textSecondary }]}>
                {subline}
              </Text>
            ) : null}

            {/* Divider */}
            <View style={[styles.divider, { backgroundColor: colors.borderSecondary }]} />

            {/* Bottom row: Location + Button */}
            <View style={styles.bottomRow}>
              <Text
                style={[styles.locationText, { color: colors.textSecondary }]}
                numberOfLines={2}
              >
                {locationText}
              </Text>

              <Pressable
                style={[styles.moreButton, { backgroundColor: colors.surfaceSecondary }]}
                onPress={(e) => {
                  e.stopPropagation();
                  router.push({
                    pathname: '/event/[id]',
                    params: { id: event.id },
                  });
                }}
              >
                <Text style={[styles.moreButtonText, { color: colors.textPrimary }]}>
                  Mehr erfahren
                </Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
    marginBottom: 20,
  },
  swiperContainer: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    position: 'relative',
    overflow: 'visible',
  },
  swiperWrapper: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  cardWrapper: {
    position: 'absolute',
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    left: 0,
    top: 0,
    borderRadius: 24,
  },

  // Card container
  card: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
    borderWidth: 1,
    padding: 8,
    overflow: 'hidden',
  },

  // Image section
  imageSection: {
    flex: 1,
    borderRadius: 18,
    overflow: 'hidden',
    position: 'relative',
  },
  blurredBg: {
    ...StyleSheet.absoluteFillObject,
  },
  whiteOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  sharpImage: {
    ...StyleSheet.absoluteFillObject,
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
  },

  // Day pill
  dayPill: {
    position: 'absolute',
    top: 12,
    left: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  dayPillText: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
  },

  // Content section
  contentSection: {
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  title: {
    fontSize: 28,
    fontFamily: 'Inter-SemiBold',
    lineHeight: 32,
    marginBottom: 6,
  },
  subline: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    marginBottom: 16,
  },
  divider: {
    height: 1,
    width: '100%',
    marginBottom: 16,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  locationText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    letterSpacing: 0.5,
    flex: 1,
    marginRight: 12,
  },
  moreButton: {
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  moreButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },

  // Pagination
  swiperPagination: {
    position: 'absolute',
    bottom: -30,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  swiperPaginationBullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  swiperPaginationBulletActive: {
    width: 20,
  },
});
