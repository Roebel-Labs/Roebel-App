import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/context/ThemeContext';
import ChevronRightIcon from '@/assets/icons/chevron-right.svg';
import CoinFlipBurst from './CoinFlipBurst';

const COIN_TILTED = require('../../assets/illustration/muenzen/top_hero_coin.png');
const COIN_STACK = require('../../assets/illustration/gamification/stack.png');

export type MuenzenButtonState = 'idle' | 'claimable';

type Props = {
  state: MuenzenButtonState;
  /** Whole Münzen the claim lands (label "+N Münze(n)"). */
  amount: number;
  /** Runs the claim; return false to abort the animation. */
  onClaim: () => boolean;
  /** Idle press → Münzen page. */
  onOpen: () => void;
};

const HEIGHT = 44;
const RADIUS = HEIGHT / 2;
const BORDER = 1.5;
const PRESS_DEPTH = 3;
const SWAP_AT_MS = 300;
const DONE_AT_MS = 900;

const GOLD = {
  border: ['#EAD98A', '#B9992F'] as const,
  fill: ['#FFF9D6', '#FFEE93', '#F9DF63'] as const,
  fillLocations: [0, 0.55, 1] as const,
  text: '#4A3E0B',
  shadow: '0px 4px 10px rgba(110, 85, 0, 0.28)',
  shadowFill: '#F9DF63',
};

/**
 * The profile's Münzen button. Claimable: a golden 3D pill ("+1 Münze") that
 * pushes down on press; on release coins flip up out of it and it morphs into
 * the neutral "Münzen ›" pill that opens the Münzen page.
 */
export default function MuenzenButton({ state, amount, onClaim, onOpen }: Props) {
  const { colors, isDark } = useTheme();
  const reducedMotion = useReducedMotion();

  // Choreography state: hold the golden look until the crossfade point.
  const [claiming, setClaiming] = useState(false);
  const [swapped, setSwapped] = useState(false);
  const [burstCount, setBurstCount] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const visual: MuenzenButtonState = claiming ? (swapped ? 'idle' : 'claimable') : state;
  const isGold = visual === 'claimable';

  // Press mechanics: surface sinks, shadow hides.
  const pressed = useSharedValue(0);
  const surfaceStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: pressed.value * PRESS_DEPTH }],
  }));
  const shadowStyle = useAnimatedStyle(() => ({ opacity: 1 - pressed.value }));

  // Skin crossfade (gold ↔ neutral) independent of the content swap.
  const gold = useSharedValue(isGold ? 1 : 0);
  useEffect(() => {
    gold.set(reducedMotion ? (isGold ? 1 : 0) : withTiming(isGold ? 1 : 0, { duration: 260 }));
  }, [gold, isGold, reducedMotion]);
  const goldSkinStyle = useAnimatedStyle(() => ({ opacity: gold.value }));
  const neutralSkinStyle = useAnimatedStyle(() => ({ opacity: 1 - gold.value }));

  const handlePressIn = useCallback(() => {
    pressed.set(withTiming(1, { duration: 90 }));
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, [pressed]);

  const handlePressOut = useCallback(() => {
    pressed.set(withSpring(0, { damping: 14, stiffness: 260 }));
  }, [pressed]);

  const handlePress = useCallback(() => {
    if (claiming) return;
    if (visual === 'idle') {
      onOpen();
      return;
    }
    if (!onClaim()) return;
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (reducedMotion) return; // the prop flips to idle; skin swaps instantly
    setClaiming(true);
    setSwapped(false);
    timers.current.push(setTimeout(() => setBurstCount(amount), 40));
    timers.current.push(setTimeout(() => setSwapped(true), SWAP_AT_MS));
    timers.current.push(
      setTimeout(() => {
        setClaiming(false);
        setSwapped(false);
      }, DONE_AT_MS),
    );
  }, [amount, claiming, onClaim, onOpen, reducedMotion, visual]);

  const handleBurstDone = useCallback(() => setBurstCount(0), []);

  const label = isGold ? (amount === 1 ? '+1 Münze' : `+${amount} Münzen`) : 'Münzen';
  const neutralBorder = isDark ? (['#4A4D52', '#2D2E31'] as const) : (['#E9E9E9', '#CFCFCF'] as const);
  const neutralFill = isDark ? ([colors.surfaceSecondary, colors.surface] as const) : (['#FFFFFF', '#F4F4F5'] as const);
  const neutralShadow = isDark ? '0px 2px 6px rgba(0,0,0,0.35)' : '0px 2px 6px rgba(0,0,0,0.10)';
  const shadowLayerStyle = {
    backgroundColor: isGold ? GOLD.shadowFill : neutralFill[1],
    boxShadow: isGold ? GOLD.shadow : neutralShadow,
  } as ViewStyle;

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={claiming}
      accessibilityRole="button"
      accessibilityLabel={isGold ? `${label} abholen` : 'Münzen anzeigen'}
      style={styles.root}
    >
      {/* Static shadow layer: the surface sinks onto it while it fades. */}
      <Animated.View pointerEvents="none" style={[styles.shadowLayer, shadowStyle, shadowLayerStyle]} />

      <Animated.View style={[styles.surface, surfaceStyle]} layout={LinearTransition.duration(260)}>
        <View style={styles.clip}>
          {/* Gold skin */}
          <Animated.View style={[StyleSheet.absoluteFill, goldSkinStyle]} pointerEvents="none">
            <LinearGradient colors={[...GOLD.border]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.borderFill}>
              <LinearGradient
                colors={[...GOLD.fill]}
                locations={[...GOLD.fillLocations]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.innerFill}
              />
              <View style={styles.rim} />
            </LinearGradient>
          </Animated.View>
          {/* Neutral skin */}
          <Animated.View style={[StyleSheet.absoluteFill, neutralSkinStyle]} pointerEvents="none">
            <LinearGradient colors={[...neutralBorder]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.borderFill}>
              <LinearGradient colors={[...neutralFill]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.innerFill} />
            </LinearGradient>
          </Animated.View>

          {isGold ? (
            <Animated.View key="claimable" entering={FadeIn.duration(220)} exiting={FadeOut.duration(180)} style={styles.content}>
              <Image source={COIN_TILTED} style={styles.coinTilted} resizeMode="contain" />
              <Text style={[styles.label, { color: GOLD.text }]}>{label}</Text>
            </Animated.View>
          ) : (
            <Animated.View key="idle" entering={FadeIn.duration(220)} exiting={FadeOut.duration(180)} style={styles.content}>
              <Image source={COIN_STACK} style={styles.coinStack} resizeMode="contain" />
              <Text style={[styles.label, { color: colors.textPrimary }]}>{label}</Text>
              <ChevronRightIcon width={16} height={16} color={colors.textSecondary} />
            </Animated.View>
          )}
        </View>
      </Animated.View>

      {burstCount > 0 && <CoinFlipBurst count={burstCount} onDone={handleBurstDone} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    alignSelf: 'flex-start',
  },
  shadowLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: RADIUS,
  },
  surface: {
    height: HEIGHT,
    borderRadius: RADIUS,
  },
  clip: {
    flex: 1,
    borderRadius: RADIUS,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  borderFill: {
    flex: 1,
    borderRadius: RADIUS,
  },
  innerFill: {
    flex: 1,
    margin: BORDER,
    borderRadius: RADIUS - BORDER,
  },
  rim: {
    position: 'absolute',
    top: BORDER + 1,
    left: 14,
    right: 14,
    height: 1,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.75)',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 10,
    paddingRight: 14,
  },
  coinTilted: {
    width: 26,
    height: 28,
  },
  coinStack: {
    width: 28,
    height: 28,
  },
  label: {
    fontSize: 15,
    fontFamily: 'MonaSans-SemiBold',
  },
});
