import React, { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import type { BotAvatarSpec } from '@/lib/chat/types';
import { BotAvatar, BotEyesLayer } from './BotAvatar';

export type TypingIndicatorProps = {
  spec: BotAvatarSpec;
  /** Default 29 (ref 13). */
  size?: number;
  style?: StyleProp<ViewStyle>;
};

/** Bot is thinking: the mascot's eyes glance around and blink (ref 13). */
export function TypingIndicator({ spec, size = 29, style }: TypingIndicatorProps) {
  const glance = useSharedValue(0);
  const blink = useSharedValue(1);

  useEffect(() => {
    glance.value = withRepeat(
      withSequence(
        withTiming(-1, { duration: 420, easing: Easing.inOut(Easing.quad) }),
        withDelay(260, withTiming(1, { duration: 520, easing: Easing.inOut(Easing.quad) })),
        withDelay(260, withTiming(0, { duration: 380, easing: Easing.inOut(Easing.quad) })),
      ),
      -1,
      false,
    );
    blink.value = withRepeat(
      withSequence(
        withDelay(1500, withTiming(0.1, { duration: 90 })),
        withTiming(1, { duration: 120 }),
      ),
      -1,
      false,
    );
    return () => {
      cancelAnimation(glance);
      cancelAnimation(blink);
    };
  }, [glance, blink]);

  const eyes = useAnimatedStyle(() => ({
    transform: [{ translateX: glance.value * size * 0.08 }, { scaleY: blink.value }],
  }));

  return (
    <View
      style={[{ width: size, height: size }, styles.wrap, style]}
      accessibilityRole="progressbar"
      accessibilityLabel="Schreibt …"
    >
      <BotAvatar spec={spec} size={size} hideEyes />
      <Animated.View style={[StyleSheet.absoluteFill, eyes]} pointerEvents="none">
        <BotEyesLayer spec={spec} size={size} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'flex-start' },
});

export default TypingIndicator;
