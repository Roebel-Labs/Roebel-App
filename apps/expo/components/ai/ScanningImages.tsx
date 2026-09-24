// Uploaded images in the AI event chat. They glide into a centered card,
// start blurred with a thin scan line sweeping over them while the flyer is
// uploaded and read, and sharpen in two steps: partly when the upload is done,
// fully when the analysis has answered. No spinner, no bubble, no caption.
import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, Easing, Image, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/context/ThemeContext';

export type ImageStage = 'uploading' | 'analyzing' | 'done';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SINGLE_WIDTH = Math.round(Math.min(SCREEN_WIDTH * 0.62, 280));
const MULTI_WIDTH = Math.round(Math.min((SCREEN_WIDTH - 24 - 16) / 3, 150));
const IMAGE_RATIO = 4 / 3; // height / width
const BAND = 56;

/** Blur strength per stage, expressed as the opacity of the blurred copy on top. */
const BLUR_BY_STAGE: Record<ImageStage, number> = { uploading: 1, analyzing: 0.45, done: 0 };

/**
 * A soft light band with a bright core line, swept top → bottom in a loop while
 * `active`, fading out when the work is done. Also used over the poster skeletons.
 */
export function ScanLine({ active, height }: { active: boolean; height: number }) {
  const progress = useRef(new Animated.Value(0)).current;
  const visible = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(visible, {
      toValue: active ? 1 : 0,
      duration: active ? 200 : 450,
      useNativeDriver: true,
    }).start();
    if (!active) return;
    progress.setValue(0);
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 1700,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [active, progress, visible]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [-BAND, height] });

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: visible }]}>
      {/* faint tint so the band reads on light and dark flyers alike */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.12)' }]} />
      <Animated.View style={[styles.band, { transform: [{ translateY }] }]}>
        <LinearGradient
          colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.35)', 'rgba(255,255,255,0)']}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.core} />
      </Animated.View>
    </Animated.View>
  );
}

function ScanningImage({ uri, stage, width }: { uri: string; stage: ImageStage; width: number }) {
  const { colors } = useTheme();
  const blur = useRef(new Animated.Value(BLUR_BY_STAGE[stage])).current;
  const height = Math.round(width * IMAGE_RATIO);

  useEffect(() => {
    Animated.timing(blur, {
      toValue: BLUR_BY_STAGE[stage],
      duration: stage === 'done' ? 700 : 450,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [stage, blur]);

  return (
    <View style={[styles.frame, { width, height, backgroundColor: colors.cardPlaceholder }]}>
      <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <Animated.Image
        source={{ uri }}
        style={[StyleSheet.absoluteFill, { opacity: blur }]}
        resizeMode="cover"
        blurRadius={20}
      />
      <ScanLine active={stage !== 'done'} height={height} />
    </View>
  );
}

export default function ScanningImages({ uris, stage }: { uris: string[]; stage: ImageStage }) {
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(enter, {
      toValue: 1,
      damping: 16,
      stiffness: 140,
      mass: 0.9,
      useNativeDriver: true,
    }).start();
  }, [enter]);

  const translateY = enter.interpolate({ inputRange: [0, 1], outputRange: [48, 0] });
  const scale = enter.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] });
  const width = uris.length === 1 ? SINGLE_WIDTH : MULTI_WIDTH;

  return (
    <Animated.View style={[styles.row, { opacity: enter, transform: [{ translateY }, { scale }] }]}>
      {uris.map((uri, i) => (
        <ScanningImage key={`${uri}-${i}`} uri={uri} stage={stage} width={width} />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginVertical: 12,
  },
  frame: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: BAND,
    justifyContent: 'center',
  },
  core: {
    height: 1.5,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
});
