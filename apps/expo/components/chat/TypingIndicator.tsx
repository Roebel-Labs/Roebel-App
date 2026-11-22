import React, { useEffect } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import type { BotAvatarSpec } from '@/lib/chat/types';
import { botAnimationUrl } from '@/lib/chat/avatar-picture';
import { BotAvatar } from './BotAvatar';

export type TypingIndicatorProps = {
  spec: BotAvatarSpec;
  /** Bot name (Mecky's picture, initial-tile letter). */
  name?: string;
  /** Default 29 (ref 13). */
  size?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Bot is thinking: characters and Mecky play their writing loop; other pictures gently breathe
 * (scale + a little bounce).
 */
export function TypingIndicator({ spec, name, size = 29, style }: TypingIndicatorProps) {
  const pulse = useSharedValue(0);
  const animated = !!botAnimationUrl(spec, name, 'writing');

  useEffect(() => {
    if (animated) return;
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 520, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 620, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
    return () => {
      cancelAnimation(pulse);
    };
  }, [pulse, animated]);

  const anim = useAnimatedStyle(() => ({
    transform: [{ translateY: -pulse.value * size * 0.06 }, { scale: 1 + pulse.value * 0.06 }],
    opacity: 0.82 + pulse.value * 0.18,
  }));

  return (
    <Animated.View
      style={[{ width: size, height: size }, styles.wrap, anim, style]}
      accessibilityRole="progressbar"
      accessibilityLabel="Schreibt …"
    >
      <BotAvatar spec={spec} name={name} size={size} animate="writing" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'flex-start' },
});

export default TypingIndicator;
