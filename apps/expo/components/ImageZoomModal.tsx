import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  FlatList,
  useWindowDimensions,
  StatusBar,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';

// Shared translucent background for the close (X) + chevron controls.
const CONTROL_BG = 'rgba(0, 0, 0, 0.45)';

type Props = {
  visible: boolean;
  /** Single image to show (legacy / comments). */
  imageUrl?: string;
  /** Full gallery — when length > 1 the lightbox becomes swipable with a
   *  "X von N Bildern" counter and prev/next chevrons. */
  images?: string[];
  onClose: () => void;
};

export default function ImageZoomModal({ visible, imageUrl, images, onClose }: Props) {
  // Normalize props into a single list. When `images` is provided we open the
  // gallery at the position of `imageUrl` (the tapped cell), defaulting to 0.
  const urls = useMemo(() => {
    if (images && images.length > 0) return images.filter(Boolean);
    return imageUrl ? [imageUrl] : [];
  }, [images, imageUrl]);

  const initialIndex = useMemo(() => {
    if (!imageUrl) return 0;
    const i = urls.indexOf(imageUrl);
    return i >= 0 ? i : 0;
  }, [urls, imageUrl]);

  if (urls.length <= 1) {
    return <SingleImageZoom visible={visible} imageUrl={urls[0] ?? ''} onClose={onClose} />;
  }

  return (
    <GalleryZoom visible={visible} urls={urls} initialIndex={initialIndex} onClose={onClose} />
  );
}

/* ------------------------------------------------------------------ */
/* Swipable multi-image gallery (with per-image zoom)                  */
/* ------------------------------------------------------------------ */

function GalleryZoom({
  visible,
  urls,
  initialIndex,
  onClose,
}: {
  visible: boolean;
  urls: string[];
  initialIndex: number;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const listRef = useRef<FlatList<string>>(null);
  const [index, setIndex] = useState(initialIndex);
  // Horizontal paging is disabled while the active image is zoomed in, so the
  // pan gesture can move the image instead of changing pages.
  const [scrollEnabled, setScrollEnabled] = useState(true);

  // Re-seat the gallery at the tapped image each time it (re)opens.
  useEffect(() => {
    if (visible) {
      setIndex(initialIndex);
      setScrollEnabled(true);
    }
  }, [visible, initialIndex]);

  const goTo = (next: number) => {
    const clamped = Math.max(0, Math.min(urls.length - 1, next));
    setIndex(clamped);
    setScrollEnabled(true);
    listRef.current?.scrollToIndex({ index: clamped, animated: true });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <StatusBar backgroundColor="black" barStyle="light-content" />
      <GestureHandlerRootView style={styles.flex1}>
        <View style={styles.backdrop}>
          {/* Close */}
          <Pressable style={styles.controlButton} onPress={onClose}>
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>

          {/* Counter — "1 von 3 Bildern" */}
          <View style={styles.counterContainer}>
            <Text style={styles.counterText}>
              {index + 1} von {urls.length} Bildern
            </Text>
          </View>

          <FlatList
            ref={listRef}
            data={urls}
            horizontal
            pagingEnabled
            scrollEnabled={scrollEnabled}
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={initialIndex}
            getItemLayout={(_, i) => ({ length: screenWidth, offset: screenWidth * i, index: i })}
            keyExtractor={(item, i) => `${i}-${item}`}
            onScrollToIndexFailed={({ index: i }) => {
              setTimeout(() => listRef.current?.scrollToIndex({ index: i, animated: false }), 50);
            }}
            onMomentumScrollEnd={(e) => {
              setIndex(Math.round(e.nativeEvent.contentOffset.x / screenWidth));
            }}
            renderItem={({ item, index: i }) => (
              <ZoomablePage
                uri={item}
                width={screenWidth}
                height={screenHeight}
                active={i === index}
                onZoomChange={(z) => setScrollEnabled(!z)}
                onClose={onClose}
              />
            )}
          />

          {/* Prev chevron */}
          {scrollEnabled && index > 0 && (
            <Pressable style={[styles.controlButton, styles.chevronLeft]} onPress={() => goTo(index - 1)} hitSlop={8}>
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </Pressable>
          )}

          {/* Next chevron */}
          {scrollEnabled && index < urls.length - 1 && (
            <Pressable style={[styles.controlButton, styles.chevronRight]} onPress={() => goTo(index + 1)} hitSlop={8}>
              <Ionicons name="chevron-forward" size={22} color="#fff" />
            </Pressable>
          )}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

/* A single zoomable page inside the gallery FlatList. Reports its zoom state up
 * so the parent can lock horizontal paging while the image is magnified. */
function ZoomablePage({
  uri,
  width,
  height,
  active,
  onZoomChange,
  onClose,
}: {
  uri: string;
  width: number;
  height: number;
  active: boolean;
  onZoomChange: (zoomed: boolean) => void;
  onClose: () => void;
}) {
  const [zoomed, setZoomed] = useState(false);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const handleZoom = (z: boolean) => {
    setZoomed(z);
    onZoomChange(z);
  };

  // When this page scrolls out of focus, drop any zoom so it's pristine on return.
  useEffect(() => {
    if (!active) {
      scale.value = 1; savedScale.value = 1;
      translateX.value = 0; translateY.value = 0;
      savedTranslateX.value = 0; savedTranslateY.value = 0;
      setZoomed(false);
    }
  }, [active]);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => { scale.value = savedScale.value * e.scale; })
    .onEnd(() => {
      if (scale.value < 1) { scale.value = withSpring(1); savedScale.value = 1; translateX.value = withSpring(0); translateY.value = withSpring(0); savedTranslateX.value = 0; savedTranslateY.value = 0; runOnJS(handleZoom)(false); }
      else if (scale.value > 4) { scale.value = withSpring(4); savedScale.value = 4; runOnJS(handleZoom)(true); }
      else { savedScale.value = scale.value; runOnJS(handleZoom)(scale.value > 1.01); }
    });

  const panGesture = Gesture.Pan()
    .enabled(zoomed)
    .onUpdate((e) => { if (scale.value > 1) { translateX.value = savedTranslateX.value + e.translationX; translateY.value = savedTranslateY.value + e.translationY; } })
    .onEnd(() => {
      savedTranslateX.value = translateX.value; savedTranslateY.value = translateY.value;
      const maxX = (width * (scale.value - 1)) / 2;
      const maxY = (height * (scale.value - 1)) / 2;
      if (translateX.value > maxX) { translateX.value = withSpring(maxX); savedTranslateX.value = maxX; }
      else if (translateX.value < -maxX) { translateX.value = withSpring(-maxX); savedTranslateX.value = -maxX; }
      if (translateY.value > maxY) { translateY.value = withSpring(maxY); savedTranslateY.value = maxY; }
      else if (translateY.value < -maxY) { translateY.value = withSpring(-maxY); savedTranslateY.value = -maxY; }
    });

  const doubleTapGesture = Gesture.Tap().numberOfTaps(2).onEnd((e) => {
    if (scale.value > 1) { scale.value = withSpring(1); savedScale.value = 1; translateX.value = withSpring(0); translateY.value = withSpring(0); savedTranslateX.value = 0; savedTranslateY.value = 0; runOnJS(handleZoom)(false); }
    else { scale.value = withSpring(2.5); savedScale.value = 2.5; const oX = width / 2 - e.x; const oY = height / 2 - e.y; translateX.value = withSpring(oX); translateY.value = withSpring(oY); savedTranslateX.value = oX; savedTranslateY.value = oY; runOnJS(handleZoom)(true); }
  });

  const singleTapGesture = Gesture.Tap().onEnd(() => { if (scale.value <= 1.1) { runOnJS(onClose)(); } });
  const composedGesture = Gesture.Simultaneous(pinchGesture, Gesture.Exclusive(doubleTapGesture, singleTapGesture), panGesture);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: scale.value }] }));

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View style={[{ width, height, justifyContent: 'center', alignItems: 'center' }, animatedStyle]}>
        <Image source={{ uri }} style={{ width, height }} contentFit="contain" accessibilityIgnoresInvertColors />
      </Animated.View>
    </GestureDetector>
  );
}

/* ------------------------------------------------------------------ */
/* Single-image pinch / pan / double-tap zoom (original behavior)      */
/* ------------------------------------------------------------------ */

function SingleImageZoom({ visible, imageUrl, onClose }: { visible: boolean; imageUrl: string; onClose: () => void }) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const resetZoom = () => {
    scale.value = withSpring(1); savedScale.value = 1;
    translateX.value = withSpring(0); translateY.value = withSpring(0);
    savedTranslateX.value = 0; savedTranslateY.value = 0;
  };

  const handleClose = () => { resetZoom(); onClose(); };

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => { scale.value = savedScale.value * e.scale; })
    .onEnd(() => {
      if (scale.value < 1) { scale.value = withSpring(1); savedScale.value = 1; translateX.value = withSpring(0); translateY.value = withSpring(0); savedTranslateX.value = 0; savedTranslateY.value = 0; }
      else if (scale.value > 4) { scale.value = withSpring(4); savedScale.value = 4; }
      else { savedScale.value = scale.value; }
    });

  const panGesture = Gesture.Pan()
    .onUpdate((e) => { if (scale.value > 1) { translateX.value = savedTranslateX.value + e.translationX; translateY.value = savedTranslateY.value + e.translationY; } })
    .onEnd(() => {
      savedTranslateX.value = translateX.value; savedTranslateY.value = translateY.value;
      const maxX = (screenWidth * (scale.value - 1)) / 2;
      const maxY = (screenHeight * (scale.value - 1)) / 2;
      if (translateX.value > maxX) { translateX.value = withSpring(maxX); savedTranslateX.value = maxX; }
      else if (translateX.value < -maxX) { translateX.value = withSpring(-maxX); savedTranslateX.value = -maxX; }
      if (translateY.value > maxY) { translateY.value = withSpring(maxY); savedTranslateY.value = maxY; }
      else if (translateY.value < -maxY) { translateY.value = withSpring(-maxY); savedTranslateY.value = -maxY; }
    });

  const doubleTapGesture = Gesture.Tap().numberOfTaps(2).onEnd((e) => {
    if (scale.value > 1) { scale.value = withSpring(1); savedScale.value = 1; translateX.value = withSpring(0); translateY.value = withSpring(0); savedTranslateX.value = 0; savedTranslateY.value = 0; }
    else { scale.value = withSpring(2.5); savedScale.value = 2.5; const oX = screenWidth / 2 - e.x; const oY = screenHeight / 2 - e.y; translateX.value = withSpring(oX); translateY.value = withSpring(oY); savedTranslateX.value = oX; savedTranslateY.value = oY; }
  });

  const singleTapGesture = Gesture.Tap().onEnd(() => { if (scale.value <= 1.1) { runOnJS(handleClose)(); } });
  const composedGesture = Gesture.Simultaneous(pinchGesture, Gesture.Exclusive(doubleTapGesture, singleTapGesture), panGesture);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: scale.value }] }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose} statusBarTranslucent>
      <StatusBar backgroundColor="black" barStyle="light-content" />
      <GestureHandlerRootView style={styles.flex1}>
        <View style={styles.backdrop}>
          <Pressable style={styles.controlButton} onPress={handleClose}>
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
          <GestureDetector gesture={composedGesture}>
            <Animated.View style={[styles.imageContainer, animatedStyle]}>
              <Image source={{ uri: imageUrl }} style={{ flex: 1, width: screenWidth, height: screenHeight }} contentFit="contain" accessibilityIgnoresInvertColors />
            </Animated.View>
          </GestureDetector>
          <View style={styles.hintContainer}>
            <Ionicons name="expand-outline" size={16} color="rgba(255,255,255,0.6)" />
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.95)' },
  // Shared circular control (close + chevrons). Close sits top-right; chevrons override left/right + vertical center.
  controlButton: { position: 'absolute', zIndex: 10, top: 60, right: 20, width: 40, height: 40, borderRadius: 9999, justifyContent: 'center', alignItems: 'center', backgroundColor: CONTROL_BG },
  imageContainer: { justifyContent: 'center', alignItems: 'center' },
  hintContainer: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, bottom: 40, backgroundColor: 'rgba(0, 0, 0, 0.5)' },
  counterContainer: { position: 'absolute', zIndex: 10, top: 64, alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: 'rgba(0, 0, 0, 0.5)' },
  counterText: { color: '#fff', fontSize: 14, fontFamily: 'Inter-Medium' },
  chevronLeft: { top: '50%', marginTop: -20, left: 10, right: undefined },
  chevronRight: { top: '50%', marginTop: -20, right: 10 },
});
