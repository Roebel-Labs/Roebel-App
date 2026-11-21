/**
 * The app's one lightbox (Airbnb-style).
 *
 * Page background, a header with title + "1 von N" in the middle, a close X on
 * the right and — when the caller has a photo overview — a grid button on the
 * left that returns to it. Each photo sits in a rounded frame sized to its own
 * aspect ratio. Swiping pages applies a parallax: the photo lags behind its
 * frame (and scales just enough to keep the frame covered), so the image
 * appears to slide "inside" the card. Pinch / double-tap zooms; while zoomed,
 * paging is locked and a pan moves the photo. A vertical drag dismisses.
 *
 * All motion runs on the UI thread from one scroll shared value.
 */
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, StatusBar, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';

/** Side gutter around a photo frame; the gap between frames while swiping is 2×. */
const GUTTER = 16;
const RADIUS = 28;
const HEADER_HEIGHT = 64;
/** How far (fraction of the page width) a photo lags behind its frame. */
const PARALLAX = 0.22;
const DEFAULT_ASPECT = 4 / 3;
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 900;

type Props = {
  visible: boolean;
  /** Single image to show, or — with `images` — the photo to open at. */
  imageUrl?: string;
  /** Full gallery; the lightbox pages through it. */
  images?: string[];
  /** Explicit start index (wins over `imageUrl`). */
  initialIndex?: number;
  /** Header title. Defaults to "Fotos". */
  title?: string;
  /** Shows the grid button top-left; called to go back to a photo overview. */
  onShowOverview?: () => void;
  onClose: () => void;
};

export default function ImageZoomModal({
  visible,
  imageUrl,
  images,
  initialIndex,
  title = 'Fotos',
  onShowOverview,
  onClose,
}: Props) {
  const urls = useMemo(() => {
    if (images && images.length > 0) return images.filter(Boolean);
    return imageUrl ? [imageUrl] : [];
  }, [images, imageUrl]);

  const startIndex = useMemo(() => {
    if (initialIndex != null) return Math.max(0, Math.min(urls.length - 1, initialIndex));
    if (!imageUrl) return 0;
    const i = urls.indexOf(imageUrl);
    return i >= 0 ? i : 0;
  }, [urls, imageUrl, initialIndex]);

  if (urls.length === 0) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {/* RN's Modal mounts children only while visible, so every open starts fresh. */}
      <Lightbox
        urls={urls}
        startIndex={startIndex}
        title={title}
        onShowOverview={onShowOverview}
        onClose={onClose}
      />
    </Modal>
  );
}

function Lightbox({
  urls,
  startIndex,
  title,
  onShowOverview,
  onClose,
}: {
  urls: string[];
  startIndex: number;
  title: string;
  onShowOverview?: () => void;
  onClose: () => void;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: pageWidth, height: screenHeight } = useWindowDimensions();
  const listRef = useRef<Animated.FlatList<string>>(null);
  const [index, setIndex] = useState(startIndex);
  const [zoomed, setZoomed] = useState(false);

  const scrollX = useSharedValue(startIndex * pageWidth);
  const dismissY = useSharedValue(0);

  const maxFrameWidth = pageWidth - GUTTER * 2;
  const maxFrameHeight = screenHeight - insets.top - HEADER_HEIGHT - insets.bottom - 56;

  useEffect(() => {
    scrollX.set(startIndex * pageWidth);
  }, [startIndex, pageWidth, scrollX]);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollX.set(e.contentOffset.x);
    },
  });

  const onMomentumEnd = useCallback(
    (e: { nativeEvent: { contentOffset: { x: number } } }) => {
      const next = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
      setIndex(Math.max(0, Math.min(urls.length - 1, next)));
    },
    [pageWidth, urls.length],
  );

  // Vertical drag to dismiss (off while zoomed — then the pan moves the photo).
  const dismissPan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!zoomed)
        .activeOffsetY([-14, 14])
        .failOffsetX([-14, 14])
        .onUpdate((e) => {
          dismissY.set(e.translationY);
        })
        .onEnd((e) => {
          if (Math.abs(e.translationY) > DISMISS_DISTANCE || Math.abs(e.velocityY) > DISMISS_VELOCITY) {
            dismissY.set(
              withTiming(Math.sign(e.translationY || 1) * screenHeight, { duration: 180 }, () => {
                runOnJS(onClose)();
              }),
            );
          } else {
            dismissY.set(withSpring(0, { damping: 20, stiffness: 220 }));
          }
        }),
    [zoomed, dismissY, screenHeight, onClose],
  );

  const contentStyle = useAnimatedStyle(() => {
    const d = Math.abs(dismissY.get());
    return {
      transform: [{ translateY: dismissY.get() }, { scale: 1 - Math.min(d / screenHeight, 1) * 0.15 }],
    };
  });
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(Math.abs(dismissY.get()) / (screenHeight * 0.6), 1),
  }));

  const renderItem = useCallback(
    ({ item, index: i }: { item: string; index: number }) => (
      <LightboxPage
        uri={item}
        index={i}
        pageWidth={pageWidth}
        maxFrameWidth={maxFrameWidth}
        maxFrameHeight={maxFrameHeight}
        scrollX={scrollX}
        placeholder={colors.surfaceSecondary}
        onZoomChange={setZoomed}
      />
    ),
    [pageWidth, maxFrameWidth, maxFrameHeight, scrollX, colors.surfaceSecondary],
  );

  const getItemLayout = useCallback(
    (_: unknown, i: number) => ({ length: pageWidth, offset: pageWidth * i, index: i }),
    [pageWidth],
  );

  return (
    <GestureHandlerRootView style={styles.flex}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }, backdropStyle]} />

      <View style={[styles.header, { paddingTop: insets.top, height: insets.top + HEADER_HEIGHT }]}>
        {onShowOverview ? (
          <Pressable
            onPress={onShowOverview}
            hitSlop={10}
            style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Fotoübersicht"
          >
            <Ionicons name="grid-outline" size={22} color={colors.textPrimary} />
          </Pressable>
        ) : (
          <View style={styles.headerButton} />
        )}
        <View style={styles.headerTitles}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
            {title}
          </Text>
          {urls.length > 1 ? (
            <Text style={[styles.counter, { color: colors.textSecondary }]}>
              {index + 1} von {urls.length}
            </Text>
          ) : null}
        </View>
        <Pressable
          onPress={onClose}
          hitSlop={10}
          style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Schließen"
        >
          <Ionicons name="close" size={28} color={colors.textPrimary} />
        </Pressable>
      </View>

      <GestureDetector gesture={dismissPan}>
        <Animated.View style={[styles.flex, contentStyle]}>
          <Animated.FlatList
            ref={listRef}
            data={urls}
            horizontal
            pagingEnabled
            scrollEnabled={!zoomed && urls.length > 1}
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={startIndex}
            getItemLayout={getItemLayout}
            keyExtractor={(item, i) => `${i}-${item}`}
            onScroll={onScroll}
            scrollEventThrottle={16}
            onMomentumScrollEnd={onMomentumEnd}
            onScrollToIndexFailed={({ index: i }) => {
              setTimeout(() => listRef.current?.scrollToIndex({ index: i, animated: false }), 50);
            }}
            renderItem={renderItem}
            initialNumToRender={3}
            windowSize={5}
            maxToRenderPerBatch={3}
            decelerationRate="fast"
          />
        </Animated.View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

/* One page: rounded frame (own aspect ratio) + parallax photo + zoom. */
const LightboxPage = memo(function LightboxPage({
  uri,
  index,
  pageWidth,
  maxFrameWidth,
  maxFrameHeight,
  scrollX,
  placeholder,
  onZoomChange,
}: {
  uri: string;
  index: number;
  pageWidth: number;
  maxFrameWidth: number;
  maxFrameHeight: number;
  scrollX: SharedValue<number>;
  placeholder: string;
  onZoomChange: (zoomed: boolean) => void;
}) {
  const [aspect, setAspect] = useState(DEFAULT_ASPECT);
  const frameWidth = Math.min(maxFrameWidth, maxFrameHeight * aspect);
  const frameHeight = frameWidth / aspect;

  const [zoomed, setZoomed] = useState(false);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  const setZoom = useCallback(
    (z: boolean) => {
      setZoomed(z);
      onZoomChange(z);
    },
    [onZoomChange],
  );

  // No reset-on-leave needed: paging is locked while a page is zoomed.

  const gesture = useMemo(() => {
    const reset = () => {
      'worklet';
      scale.set(withSpring(1, { damping: 18 }));
      savedScale.set(1);
      tx.set(withSpring(0, { damping: 18 }));
      ty.set(withSpring(0, { damping: 18 }));
      savedTx.set(0);
      savedTy.set(0);
    };
    const pinch = Gesture.Pinch()
      .onUpdate((e) => {
        scale.set(savedScale.get() * e.scale);
      })
      .onEnd(() => {
        if (scale.get() <= 1) {
          reset();
          runOnJS(setZoom)(false);
        } else {
          const s = scale.get() > 4 ? 4 : scale.get();
          scale.set(withSpring(s, { damping: 18 }));
          savedScale.set(s);
          runOnJS(setZoom)(s > 1.01);
        }
      });
    const pan = Gesture.Pan()
      .enabled(zoomed)
      .onUpdate((e) => {
        tx.set(savedTx.get() + e.translationX);
        ty.set(savedTy.get() + e.translationY);
      })
      .onEnd(() => {
        const maxX = (frameWidth * (scale.get() - 1)) / 2;
        const maxY = (frameHeight * (scale.get() - 1)) / 2;
        const cx = tx.get() > maxX ? maxX : tx.get() < -maxX ? -maxX : tx.get();
        const cy = ty.get() > maxY ? maxY : ty.get() < -maxY ? -maxY : ty.get();
        tx.set(withSpring(cx, { damping: 18 }));
        ty.set(withSpring(cy, { damping: 18 }));
        savedTx.set(cx);
        savedTy.set(cy);
      });
    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .onEnd((e) => {
        if (scale.get() > 1) {
          reset();
          runOnJS(setZoom)(false);
        } else {
          const ox = frameWidth / 2 - e.x;
          const oy = frameHeight / 2 - e.y;
          scale.set(withSpring(2.5, { damping: 18 }));
          savedScale.set(2.5);
          tx.set(withSpring(ox, { damping: 18 }));
          ty.set(withSpring(oy, { damping: 18 }));
          savedTx.set(ox);
          savedTy.set(oy);
          runOnJS(setZoom)(true);
        }
      });
    return Gesture.Simultaneous(pinch, doubleTap, pan);
  }, [zoomed, frameWidth, frameHeight, scale, savedScale, tx, ty, savedTx, savedTy, setZoom]);

  const zoomStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.get() }, { translateY: ty.get() }, { scale: scale.get() }],
  }));

  // Parallax: r = this page's offset from centre in pages (-1 … 1). The photo
  // shifts the same way the scroll goes, so it lags its frame; the scale is
  // exactly enough that the frame never shows an edge.
  const parallaxStyle = useAnimatedStyle(() => {
    const raw = (scrollX.get() - index * pageWidth) / pageWidth;
    const r = raw < -1 ? -1 : raw > 1 ? 1 : raw;
    const shift = r * pageWidth * PARALLAX;
    const cover = 1 + (2 * Math.abs(shift)) / frameWidth;
    return { transform: [{ translateX: shift }, { scale: cover }] };
  }, [index, pageWidth, frameWidth]);

  return (
    <View style={[styles.page, { width: pageWidth }]}>
      <GestureDetector gesture={gesture}>
        <Animated.View
          style={[
            styles.frame,
            { width: frameWidth, height: frameHeight, backgroundColor: placeholder },
            zoomStyle,
          ]}
        >
          <Animated.View style={[StyleSheet.absoluteFill, parallaxStyle]}>
            <Image
              source={{ uri }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={uri}
              transition={120}
              onLoad={(e) => {
                const { width, height } = e.source;
                if (width > 0 && height > 0) setAspect(width / height);
              }}
              accessibilityIgnoresInvertColors
            />
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    zIndex: 10,
  },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitles: { flex: 1, alignItems: 'center' },
  title: { fontSize: 17, fontFamily: fontFamily.semiBold },
  counter: { fontSize: 14, fontFamily: fontFamily.regular, marginTop: 2 },
  pressed: { opacity: 0.6 },
  page: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  frame: { borderRadius: RADIUS, overflow: 'hidden' },
});
