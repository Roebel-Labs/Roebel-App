import React from 'react';
import { View, Modal, Pressable, useWindowDimensions, StatusBar, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';

type Props = { visible: boolean; imageUrl: string; onClose: () => void };

export default function ImageZoomModal({ visible, imageUrl, onClose }: Props) {
  const { colors } = useTheme();
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
          <Pressable style={[styles.closeButton, { backgroundColor: colors.tabIconActive }]} onPress={handleClose}>
            <Ionicons name="close" size={28} color={colors.textInverted} />
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
  closeButton: { position: 'absolute', zIndex: 10, width: 44, height: 44, borderRadius: 9999, justifyContent: 'center', alignItems: 'center', top: 60, right: 20 },
  imageContainer: { justifyContent: 'center', alignItems: 'center' },
  hintContainer: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, bottom: 40, backgroundColor: 'rgba(0, 0, 0, 0.5)' },
});
