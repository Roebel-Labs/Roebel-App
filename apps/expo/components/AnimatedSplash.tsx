import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

const NAVY = '#00498B';

// The official Röbel windmill mark (master: apps/web/public/favicon.svg), with
// the navy backdrop + metadata stripped so only the white ring + windmill render.
// Kept as vector (SvgXml) so the logo stays sharp while it zooms.
// Only the windmill is SVG. The ring is a native bordered View (see styles.ring):
// react-native-svg rasterises once at layout size, so a scaled SVG ring went
// blurry at full zoom, while native borders are redrawn sharp at any scale.
const WINDMILL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none"><path d="M139.084 277.371H91.3125C96.5506 332.056 136.947 441.428 256.627 441.428C376.307 441.428 414.189 344.628 418.17 296.228L392.398 290.571L360.97 163.599L334.57 290.571V332.685H291.827C289.941 325.352 286.044 310.308 285.541 308.799C285.038 307.291 285.751 307.333 286.17 307.542L294.341 315.714L314.455 296.228L277.998 261.028L313.827 225.199L293.713 205.085L262.913 234.628C261.865 233.999 259.141 232.742 256.627 232.742C254.113 232.742 250.97 233.999 249.713 234.628L220.17 205.085L197.541 225.199L235.255 260.399L198.17 296.228L219.541 316.971C221.846 314.456 226.707 309.302 227.713 308.799C228.718 308.296 228.97 309.009 228.97 309.428L223.312 332.685H181.198C179.187 303.519 174.074 246.361 171.77 221.428L157.312 162.971L143.484 221.428L139.084 277.371Z" fill="white"/></svg>`;

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const HALF_DIAGONAL = Math.sqrt(SCREEN_W * SCREEN_W + SCREEN_H * SCREEN_H) / 2;

// Logo box at scale 1. At START_SCALE it matches the native splash icon, so
// the hand-off from the native splash is seamless (calibrated on SDK 56).
const LOGO_SIZE = Math.round(SCREEN_W * 0.5);
const START_SCALE = 0.6;

// Radius of the hole = the ring's stroke centre line (182.9 of 512 viewBox
// units). The white stroke covers the seam between frame and hole.
const HOLE_R = (182.914 / 512) * LOGO_SIZE;
const RING_W = (36.4571 / 512) * LOGO_SIZE;
// The windmill is rasterised at this multiple of its on-screen size, so it
// stays sharp until it has faded out (by ~2x zoom).
const WINDMILL_RES = 2;
// Navy frame thickness around the hole: covers the whole screen even at the
// smallest scale (the hole sits in the centre, so a half diagonal suffices;
// doubled for margin).
const FRAME_W = Math.ceil(HALF_DIAGONAL * 2);
// Zoom until the hole is wider than the screen corners -> the app is fully
// visible and the ring has flown off-screen.
const END_SCALE = (HALF_DIAGONAL * 1.15) / HOLE_R;

/**
 * AnimatedSplash — X-style reveal on top of the native expo-splash-screen.
 *
 * Same navy + white windmill as the native splash, so the hand-off is
 * invisible. Then:
 *   1. the navy inside the ring fades to transparent (the app shows through
 *      the ring) while the logo dips slightly,
 *   2. the whole mark zooms in with acceleration until the hole is bigger
 *      than the screen; the windmill fades out early, the (native, always
 *      sharp) ring carries the zoom.
 *
 * The app underneath is already mounted and interactive-ready when this
 * starts, so nothing waits on it. ~520 ms total; the app is visible from
 * ~100 ms on. `onFinish` fires when the zoom completes so the parent can
 * unmount the overlay.
 */
export default function AnimatedSplash({ onFinish }: { onFinish: () => void }) {
  const scale = useRef(new Animated.Value(START_SCALE)).current;
  const discOpacity = useRef(new Animated.Value(1)).current;
  const markOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(discOpacity, {
        toValue: 0,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.sequence([
        // Small anticipation dip, like the X app.
        Animated.timing(scale, {
          toValue: START_SCALE * 0.9,
          duration: 160,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: END_SCALE,
          duration: 360,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      // The windmill leaves early (while still small); the ring carries the zoom.
      Animated.timing(markOpacity, {
        toValue: 0,
        duration: 150,
        delay: 180,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) onFinish();
    });
  }, [scale, discOpacity, markOpacity, onFinish]);

  return (
    <View pointerEvents="none" style={styles.overlay}>
      <Animated.View style={[styles.logoBox, { transform: [{ scale }] }]}>
        {/* Navy everywhere except a round hole inside the ring. */}
        <View style={styles.frame} />
        {/* Navy fill of the hole — fades out to reveal the app. */}
        <Animated.View style={[styles.disc, { opacity: discOpacity }]} />
        <View style={styles.ring} />
        <Animated.View style={[styles.windmill, { opacity: markOpacity }]}>
          <SvgXml xml={WINDMILL_SVG} width={LOGO_SIZE * WINDMILL_RES} height={LOGO_SIZE * WINDMILL_RES} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoBox: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    position: 'absolute',
    width: (HOLE_R + FRAME_W) * 2,
    height: (HOLE_R + FRAME_W) * 2,
    borderRadius: HOLE_R + FRAME_W,
    borderWidth: FRAME_W,
    borderColor: NAVY,
  },
  ring: {
    position: 'absolute',
    width: HOLE_R * 2 + RING_W,
    height: HOLE_R * 2 + RING_W,
    borderRadius: HOLE_R + RING_W / 2,
    borderWidth: RING_W,
    borderColor: '#FFFFFF',
  },
  windmill: {
    position: 'absolute',
    width: LOGO_SIZE * WINDMILL_RES,
    height: LOGO_SIZE * WINDMILL_RES,
    transform: [{ scale: 1 / WINDMILL_RES }],
  },
  disc: {
    position: 'absolute',
    width: HOLE_R * 2 + 2,
    height: HOLE_R * 2 + 2,
    borderRadius: HOLE_R + 1,
    backgroundColor: NAVY,
  },
});
