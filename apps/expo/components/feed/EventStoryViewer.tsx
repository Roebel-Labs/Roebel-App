import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  Animated as RNAnimated,
  useWindowDimensions,
  StatusBar,
  Easing,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  interpolateColor,
  Extrapolation,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { EventRecord } from '@/lib/types';

type Props = {
  events: EventRecord[];
  initialIndex: number;
  onClose: () => void;
  onNavigateToEvent: (id: string) => void;
};

const STORY_DURATION = 10000; // 10 seconds
const SWIPE_UP_THRESHOLD = -60;
const SWIPE_DOWN_THRESHOLD = 120;
const SWIPE_DOWN_VELOCITY = 800;

function formatEventDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('de-DE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function formatWeekdayLong(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('de-DE', { weekday: 'long' });
}

export default function EventStoryViewer({
  events,
  initialIndex,
  onClose,
  onNavigateToEvent,
}: Props) {
  const { width, height } = useWindowDimensions();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [paused, setPaused] = useState(false);

  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;

  const eventsRef = useRef(events);
  eventsRef.current = events;

  const event = events[currentIndex];

  // --- Progress bar animation (0 → 1 over 10s) ---
  const progress = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    if (paused) return;
    progress.setValue(0);
    const anim = RNAnimated.timing(progress, {
      toValue: 1,
      duration: STORY_DURATION,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    anim.start(({ finished }) => {
      if (finished) {
        const idx = currentIndexRef.current;
        if (idx < eventsRef.current.length - 1) {
          setCurrentIndex(idx + 1);
        } else {
          onClose();
        }
      }
    });
    return () => anim.stop();
  }, [currentIndex, paused]);

  // --- Arrow bounce animation ---
  const arrowBounce = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    const loop = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(arrowBounce, {
          toValue: -4,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        RNAnimated.timing(arrowBounce, {
          toValue: 0,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // --- Gesture: swipe down to close, swipe up to navigate ---
  const dragY = useSharedValue(0);

  const resumeTimer = useCallback(() => {
    setPaused(false);
  }, []);

  const pauseTimer = useCallback(() => {
    setPaused(true);
  }, []);

  const handleNavigateUp = useCallback(() => {
    const id = eventsRef.current[currentIndexRef.current]?.id;
    if (id) onNavigateToEvent(id);
  }, [onNavigateToEvent]);

  const pan = Gesture.Pan()
    .activeOffsetY([-8, 8])
    .failOffsetX([-32, 32])
    .onStart(() => {
      runOnJS(pauseTimer)();
    })
    .onUpdate((e) => {
      dragY.value = e.translationY;
    })
    .onEnd((e) => {
      if (dragY.value < SWIPE_UP_THRESHOLD) {
        dragY.value = withSpring(0, { damping: 20, stiffness: 180 });
        runOnJS(handleNavigateUp)();
        runOnJS(resumeTimer)();
      } else if (dragY.value > SWIPE_DOWN_THRESHOLD || e.velocityY > SWIPE_DOWN_VELOCITY) {
        dragY.value = withTiming(height, { duration: 220 }, (finished) => {
          if (finished) runOnJS(onClose)();
        });
      } else {
        dragY.value = withSpring(0, { damping: 20, stiffness: 180 });
        runOnJS(resumeTimer)();
      }
    });

  const imageAnimatedStyle = useAnimatedStyle(() => {
    const down = Math.max(dragY.value, 0);
    return {
      transform: [{ translateY: down }],
      opacity: interpolate(down, [0, height * 0.6], [1, 0.35], Extrapolation.CLAMP),
    };
  });

  const backdropAnimatedStyle = useAnimatedStyle(() => {
    const down = Math.max(dragY.value, 0);
    return {
      backgroundColor: interpolateColor(
        down,
        [0, height * 0.5],
        ['rgba(0,0,0,1)', 'rgba(0,0,0,0)'],
      ),
    };
  });

  const chromeAnimatedStyle = useAnimatedStyle(() => {
    const down = Math.max(dragY.value, 0);
    return {
      opacity: interpolate(down, [0, height * 0.18], [1, 0], Extrapolation.CLAMP),
    };
  });

  const overlayAnimatedStyle = useAnimatedStyle(() => {
    const down = Math.max(dragY.value, 0);
    return {
      opacity: interpolate(down, [0, height * 0.35], [1, 0], Extrapolation.CLAMP),
    };
  });

  const handleTap = useCallback(
    (side: 'left' | 'right') => {
      if (side === 'left') {
        setCurrentIndex((i) => Math.max(0, i - 1));
      } else {
        if (currentIndex < events.length - 1) {
          setCurrentIndex((i) => i + 1);
        } else {
          onClose();
        }
      }
    },
    [currentIndex, events.length, onClose],
  );

  if (!event) return null;

  const orgName = event.account?.name ?? event.organizer_name;
  const orgAvatar = (event.account as any)?.avatar_url ?? null;

  return (
    <Modal visible animationType="fade" transparent statusBarTranslucent onRequestClose={onClose}>
      <StatusBar hidden />
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[styles.container, { width, height }, backdropAnimatedStyle]}>
          <GestureDetector gesture={pan}>
            <View style={StyleSheet.absoluteFill}>
              {/* Image follows finger on downward drag */}
              <Animated.View style={[StyleSheet.absoluteFill, imageAnimatedStyle]}>
                {event.image_url ? (
                  <Image
                    source={{ uri: event.image_url }}
                    style={StyleSheet.absoluteFill}
                    contentFit="contain"
                  />
                ) : (
                  <View style={[StyleSheet.absoluteFill, styles.imageFallback]} />
                )}
              </Animated.View>

              {/* Tap zones */}
              <View style={styles.tapRow} pointerEvents="box-none">
                <Pressable style={styles.tapZone} onPress={() => handleTap('left')} />
                <Pressable style={styles.tapZone} onPress={() => handleTap('right')} />
              </View>

              {/* Progress bars (chrome — fades with drag) */}
              <Animated.View style={[styles.progressRow, chromeAnimatedStyle]} pointerEvents="none">
                {events.map((_, i) => {
                  if (i < currentIndex) {
                    return <View key={i} style={[styles.progressBar, styles.progressBarDone]} />;
                  }
                  if (i === currentIndex) {
                    return (
                      <View key={i} style={[styles.progressBar, styles.progressBarBg]}>
                        <RNAnimated.View
                          style={[
                            styles.progressBarFill,
                            {
                              width: progress.interpolate({
                                inputRange: [0, 1],
                                outputRange: ['0%', '100%'],
                              }),
                            },
                          ]}
                        />
                      </View>
                    );
                  }
                  return <View key={i} style={[styles.progressBar, styles.progressBarFuture]} />;
                })}
              </Animated.View>

              {/* Header: org avatar + name + close (chrome — fades with drag) */}
              <Animated.View style={[styles.header, chromeAnimatedStyle]}>
                <View style={styles.orgAvatarWrap}>
                  {orgAvatar ? (
                    <Image
                      source={{ uri: orgAvatar }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                    />
                  ) : (
                    <Text style={styles.orgAvatarLetter}>
                      {orgName.charAt(0).toUpperCase()}
                    </Text>
                  )}
                </View>
                <View style={styles.orgInfo}>
                  <Text style={styles.orgName} numberOfLines={1}>
                    {orgName}
                  </Text>
                  <Text style={styles.eventDate}>{formatEventDate(event.date)}</Text>
                </View>
                <Pressable onPress={onClose} hitSlop={16} style={styles.closeBtn}>
                  <Ionicons name="close" size={24} color="#ffffff" />
                </Pressable>
              </Animated.View>

              {/* Bottom gradient (overlay — fades later than chrome) */}
              <Animated.View
                style={[styles.bottomGradient, overlayAnimatedStyle]}
                pointerEvents="none"
              >
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.93)']}
                  locations={[0, 0.45, 1]}
                  style={StyleSheet.absoluteFill}
                />
              </Animated.View>

              {/* Bottom content (chrome — fades with drag) */}
              <Animated.View
                style={[styles.bottomContent, chromeAnimatedStyle]}
                pointerEvents="box-none"
              >
                <View style={styles.weekdayPill}>
                  <Text style={styles.weekdayPillText}>{formatWeekdayLong(event.date)}</Text>
                </View>
                <Text style={styles.eventTitle} numberOfLines={2}>
                  {event.title}
                </Text>
                {event.location ? (
                  <Text style={styles.eventMeta} numberOfLines={1}>
                    {'\u{1F4CD}'} {event.location}
                  </Text>
                ) : null}
                <Pressable
                  style={styles.ctaBtn}
                  onPress={() => onNavigateToEvent(event.id)}
                  pointerEvents="auto"
                >
                  <RNAnimated.View style={{ transform: [{ translateY: arrowBounce }] }}>
                    <Ionicons name="chevron-up" size={18} color="#ffffff" />
                  </RNAnimated.View>
                  <Text style={styles.ctaText}>Mehr erfahren</Text>
                </Pressable>
              </Animated.View>
            </View>
          </GestureDetector>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  imageFallback: {
    backgroundColor: '#1a2a4a',
  },
  tapRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    top: 120,
    bottom: 200,
  },
  tapZone: {
    flex: 1,
  },
  progressRow: {
    position: 'absolute',
    top: 52,
    left: 12,
    right: 12,
    flexDirection: 'row',
    gap: 4,
  },
  progressBar: {
    flex: 1,
    height: 2,
    borderRadius: 1,
    overflow: 'hidden',
  },
  progressBarDone: {
    backgroundColor: '#ffffff',
  },
  progressBarBg: {
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 1,
  },
  progressBarFuture: {
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  header: {
    position: 'absolute',
    top: 64,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  orgAvatarWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: '#ffffff',
    backgroundColor: '#194383',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  orgAvatarLetter: {
    color: '#ffffff',
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  orgInfo: {
    flex: 1,
  },
  orgName: {
    color: '#ffffff',
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  eventDate: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    marginTop: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 260,
  },
  bottomContent: {
    position: 'absolute',
    bottom: 48,
    left: 20,
    right: 20,
  },
  weekdayPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 10,
  },
  weekdayPillText: {
    color: '#000000',
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
  },
  eventTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontFamily: 'Inter-Bold',
    lineHeight: 28,
    marginBottom: 6,
  },
  eventMeta: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    marginBottom: 20,
  },
  ctaBtn: {
    alignSelf: 'center',
    alignItems: 'center',
    gap: 2,
  },
  ctaText: {
    color: '#ffffff',
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
});
