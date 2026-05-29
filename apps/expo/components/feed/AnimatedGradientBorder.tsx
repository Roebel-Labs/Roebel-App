import React, { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

interface AnimatedGradientBorderProps {
  /** When true the gradient ring rotates; when false a static thin border is shown. */
  active: boolean;
  /** Outer corner radius. */
  radius?: number;
  /** Thickness of the visible ring. */
  borderWidth?: number;
  /** Three-stop gradient colors, e.g. [primary, lightBlue, primary]. */
  colors: readonly [string, string, string];
  /** Fill behind the content — masks the gradient centre, leaving only the ring. */
  backgroundColor: string;
  /** Static border color used when `active` is false. */
  idleBorderColor: string;
  /** Rotation period in ms (one full turn). */
  durationMs?: number;
  style?: ViewStyle;
  children: React.ReactNode;
}

/**
 * Rotating-gradient border. RN has no conic gradient and the project has no
 * masked-view dep, so we use the standard technique: a square gradient larger
 * than the card spins behind it, and an opaque inner card masks the centre so
 * only the padding ring shows the moving gradient.
 *
 * The rotation easing is intentionally non-linear — fast, then nearly stopping
 * mid-turn, then fast again — looping seamlessly because 360° ≡ 0° and the
 * velocity matches at both ends of each cycle.
 */
export default function AnimatedGradientBorder({
  active,
  radius = 16,
  borderWidth = 2,
  colors,
  backgroundColor,
  idleBorderColor,
  durationMs = 3500,
  style,
  children,
}: AnimatedGradientBorderProps) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const rotation = useSharedValue(0);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) => (prev.w === width && prev.h === height ? prev : { w: width, h: height }));
  };

  useEffect(() => {
    if (active) {
      rotation.value = 0;
      rotation.value = withRepeat(
        // Fast → near-stop → fast cadence: steep slope near t=0 and t=1, flat at t=0.5.
        withTiming(1, { duration: durationMs, easing: Easing.bezier(0.2, 0.85, 0.8, 0.15) }),
        -1,
        false,
      );
    } else {
      cancelAnimation(rotation);
      rotation.value = 0;
    }
    return () => cancelAnimation(rotation);
  }, [active, durationMs, rotation]);

  const gradientStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value * 360}deg` }],
  }));

  // Side of the spinning square: the card's diagonal, so its corners always
  // cover the card no matter the rotation angle.
  const square = Math.ceil(Math.hypot(size.w, size.h)) || 0;

  if (!active) {
    return (
      <View
        onLayout={onLayout}
        style={[
          {
            borderRadius: radius,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: idleBorderColor,
            backgroundColor,
            overflow: 'hidden',
          },
          style,
        ]}
      >
        {children}
      </View>
    );
  }

  return (
    <View
      onLayout={onLayout}
      style={[
        {
          borderRadius: radius,
          padding: borderWidth,
          overflow: 'hidden',
          backgroundColor,
        },
        style,
      ]}
    >
      {square > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.gradientWrap,
            {
              width: square,
              height: square,
              left: (size.w - square) / 2,
              top: (size.h - square) / 2,
            },
            gradientStyle,
          ]}
        >
          <LinearGradient
            colors={[colors[0], colors[1], colors[2], colors[1], colors[0]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.fill}
          />
        </Animated.View>
      ) : null}
      <View style={{ backgroundColor, borderRadius: Math.max(0, radius - borderWidth), overflow: 'hidden' }}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  gradientWrap: {
    position: 'absolute',
  },
  fill: {
    flex: 1,
  },
});
