/**
 * The Röbel app mark (apps/web/public/favicon.svg master): ring + windmill, drawn in one ink color
 * (no navy disk). `animated` turns it into the account-switch loader: the logo springs in, the ring
 * becomes a rotating arc over a faint full ring, the windmill breathes.
 */
import React, { useEffect } from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

const WINDMILL =
  'M139.084 277.371H91.3125C96.5506 332.056 136.947 441.428 256.627 441.428C376.307 441.428 414.189 344.628 418.17 296.228L392.398 290.571L360.97 163.599L334.57 290.571V332.685H291.827C289.941 325.352 286.044 310.308 285.541 308.799C285.038 307.291 285.751 307.333 286.17 307.542L294.341 315.714L314.455 296.228L277.998 261.028L313.827 225.199L293.713 205.085L262.913 234.628C261.865 233.999 259.141 232.742 256.627 232.742C254.113 232.742 250.97 233.999 249.713 234.628L220.17 205.085L197.541 225.199L235.255 260.399L198.17 296.228L219.541 316.971C221.846 314.456 226.707 309.302 227.713 308.799C228.718 308.296 228.97 309.009 228.97 309.428L223.312 332.685H181.198C179.187 303.519 174.074 246.361 171.77 221.428L157.312 162.971L143.484 221.428L139.084 277.371Z';
const RING_R = 182.914;
const RING_W = 36.4571;
const RING_C = 2 * Math.PI * RING_R;

type Props = { size?: number; color: string; animated?: boolean };

export default function RoebelLogo({ size = 72, color, animated = false }: Props) {
  const reduce = useReducedMotion();
  const enter = useSharedValue(animated ? 0 : 1);
  const spin = useSharedValue(0);
  const breathe = useSharedValue(1);

  useEffect(() => {
    if (!animated) return;
    enter.value = withSpring(1, { damping: 14, stiffness: 160, mass: 0.7 });
    if (!reduce) {
      spin.value = withDelay(120, withRepeat(withTiming(1, { duration: 1100, easing: Easing.linear }), -1, false));
      breathe.value = withRepeat(
        withSequence(
          withTiming(0.94, { duration: 650, easing: Easing.inOut(Easing.quad) }),
          withTiming(1, { duration: 650, easing: Easing.inOut(Easing.quad) })
        ),
        -1,
        false
      );
    }
    return () => {
      cancelAnimation(spin);
      cancelAnimation(breathe);
    };
  }, [animated, reduce, enter, spin, breathe]);

  const wrapStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ scale: 0.82 + 0.18 * enter.value }],
  }));
  const ringStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const millStyle = useAnimatedStyle(() => ({ transform: [{ scale: breathe.value }] }));

  if (!animated) {
    return (
      <Svg width={size} height={size} viewBox="0 0 512 512">
        <Circle cx={256} cy={256} r={RING_R} stroke={color} strokeWidth={RING_W} fill="none" />
        <Path d={WINDMILL} fill={color} />
      </Svg>
    );
  }

  return (
    <Animated.View style={[{ width: size, height: size }, wrapStyle]}>
      {/* Faint full ring as the track. */}
      <Svg width={size} height={size} viewBox="0 0 512 512" style={{ position: 'absolute' }}>
        <Circle cx={256} cy={256} r={RING_R} stroke={color} strokeOpacity={0.14} strokeWidth={RING_W} fill="none" />
      </Svg>
      {/* Rotating arc (a third of the ring). */}
      <Animated.View style={[{ position: 'absolute', width: size, height: size }, ringStyle]}>
        <Svg width={size} height={size} viewBox="0 0 512 512">
          <Circle
            cx={256}
            cy={256}
            r={RING_R}
            stroke={color}
            strokeWidth={RING_W}
            strokeLinecap="round"
            strokeDasharray={`${RING_C * (reduce ? 1 : 0.32)} ${RING_C}`}
            fill="none"
          />
        </Svg>
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', width: size, height: size }, millStyle]}>
        <Svg width={size} height={size} viewBox="0 0 512 512">
          <Path d={WINDMILL} fill={color} />
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}
