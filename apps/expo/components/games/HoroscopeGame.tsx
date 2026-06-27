import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  useWindowDimensions,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withRepeat,
  withSequence,
  withDelay,
  interpolate,
  Easing,
  cancelAnimation,
  runOnJS,
} from 'react-native-reanimated';
import Svg, { Circle, Path, Defs, RadialGradient, Stop } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { fontFamily, fontSize, borderRadius } from '@/constants/theme';
import {
  ZODIAC_SIGNS,
  ELEMENT_COLORS,
  getDailyHoroscope,
  getZodiacById,
  type ZodiacSign,
  type DailyHoroscope,
} from '@/lib/horoscope';

// ─── Constants ───────────────────────────────────────────────

const HOLD_DURATION = 3000; // 3 seconds to hold
const SPIN_DURATION = 2000; // 2 seconds of fast spinning
const CIRCLE_SIZE = 200;
const CIRCLE_RADIUS = CIRCLE_SIZE / 2;
const STAR_POINTS = 5;

type Phase = 'selecting' | 'pressing' | 'spinning' | 'revealed';

// ─── Star Path Generator ────────────────────────────────────

function createStarPath(cx: number, cy: number, outerR: number, innerR: number, points: number): string {
  const angle = Math.PI / points;
  let d = '';
  for (let i = 0; i < 2 * points; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const x = cx + r * Math.sin(i * angle);
    const y = cy - r * Math.cos(i * angle);
    d += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ',' + y.toFixed(2);
  }
  return d + 'Z';
}

// ─── Main Component ──────────────────────────────────────────

export default function HoroscopeGame() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();

  const [phase, setPhase] = useState<Phase>('selecting');
  const [selectedSign, setSelectedSign] = useState<string | null>(null);
  const [horoscope, setHoroscope] = useState<DailyHoroscope | null>(null);

  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPressing = useRef(false);

  // ─── Shared Values ────────────────────────────────────────

  // Selection phase
  const weiterOpacity = useSharedValue(0);
  const weiterTranslateY = useSharedValue(20);

  // Circle animations
  const circleRotation = useSharedValue(0);
  const starRotation = useSharedValue(0);
  const glowOpacity = useSharedValue(0.3);
  const progressAngle = useSharedValue(0);
  const circleScale = useSharedValue(1);
  const circleOpacity = useSharedValue(1);

  // Particles
  const particle1Angle = useSharedValue(0);
  const particle2Angle = useSharedValue(Math.PI * 0.5);
  const particle3Angle = useSharedValue(Math.PI);
  const particle4Angle = useSharedValue(Math.PI * 1.5);
  const particleOpacity = useSharedValue(0);

  // Result
  const resultOpacity = useSharedValue(0);
  const resultTranslateY = useSharedValue(60);

  // Instruction text
  const instructionOpacity = useSharedValue(1);

  // ─── Selection Handlers ───────────────────────────────────

  const handleSelectSign = useCallback((signId: string) => {
    setSelectedSign(signId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    weiterOpacity.value = withTiming(1, { duration: 300 });
    weiterTranslateY.value = withSpring(0, { damping: 15, stiffness: 200 });
  }, [weiterOpacity, weiterTranslateY]);

  const handleWeiter = useCallback(() => {
    if (!selectedSign) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPhase('pressing');

    // Start idle circle animations
    circleRotation.value = withRepeat(
      withTiming(360, { duration: 8000, easing: Easing.linear }),
      -1,
      false
    );
    starRotation.value = withRepeat(
      withTiming(-360, { duration: 12000, easing: Easing.linear }),
      -1,
      false
    );
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.5, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.3, { duration: 1500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, [selectedSign, circleRotation, starRotation, glowOpacity]);

  // ─── Press Handlers ───────────────────────────────────────

  const handlePressIn = useCallback(() => {
    if (phase !== 'pressing') return;
    isPressing.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Speed up circle rotation
    cancelAnimation(circleRotation);
    circleRotation.value = withRepeat(
      withTiming(circleRotation.value + 360, { duration: 3000, easing: Easing.linear }),
      -1,
      false
    );

    // Speed up star
    cancelAnimation(starRotation);
    starRotation.value = withRepeat(
      withTiming(starRotation.value - 360, { duration: 4000, easing: Easing.linear }),
      -1,
      false
    );

    // Intensify glow
    cancelAnimation(glowOpacity);
    glowOpacity.value = withTiming(1, { duration: HOLD_DURATION, easing: Easing.out(Easing.ease) });

    // Fill progress ring
    progressAngle.value = withTiming(360, {
      duration: HOLD_DURATION,
      easing: Easing.linear,
    });

    // Show particles
    particleOpacity.value = withTiming(1, { duration: 500 });
    particle1Angle.value = withRepeat(
      withTiming(particle1Angle.value + Math.PI * 2, { duration: 3000, easing: Easing.linear }),
      -1, false
    );
    particle2Angle.value = withRepeat(
      withTiming(particle2Angle.value + Math.PI * 2, { duration: 3500, easing: Easing.linear }),
      -1, false
    );
    particle3Angle.value = withRepeat(
      withTiming(particle3Angle.value + Math.PI * 2, { duration: 4000, easing: Easing.linear }),
      -1, false
    );
    particle4Angle.value = withRepeat(
      withTiming(particle4Angle.value + Math.PI * 2, { duration: 2800, easing: Easing.linear }),
      -1, false
    );

    // Scale up slightly
    circleScale.value = withTiming(1.08, { duration: HOLD_DURATION, easing: Easing.out(Easing.ease) });

    // Fade instruction
    instructionOpacity.value = withTiming(0.3, { duration: 500 });

    // Hold timer
    holdTimerRef.current = setTimeout(() => {
      if (isPressing.current) {
        triggerSpin();
      }
    }, HOLD_DURATION);
  }, [phase, circleRotation, starRotation, glowOpacity, progressAngle, particleOpacity, particle1Angle, particle2Angle, particle3Angle, particle4Angle, circleScale, instructionOpacity]);

  const handlePressOut = useCallback(() => {
    isPressing.current = false;

    if (phase !== 'pressing') return;

    // Cancel hold timer
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    // Reset progress if not complete
    if (progressAngle.value < 350) {
      progressAngle.value = withTiming(0, { duration: 300 });
      glowOpacity.value = withTiming(0.3, { duration: 500 });
      circleScale.value = withSpring(1, { damping: 15, stiffness: 200 });
      instructionOpacity.value = withTiming(1, { duration: 300 });
      particleOpacity.value = withTiming(0, { duration: 300 });

      // Return to idle rotation speed
      cancelAnimation(circleRotation);
      circleRotation.value = withRepeat(
        withTiming(circleRotation.value + 360, { duration: 8000, easing: Easing.linear }),
        -1, false
      );
      cancelAnimation(starRotation);
      starRotation.value = withRepeat(
        withTiming(starRotation.value - 360, { duration: 12000, easing: Easing.linear }),
        -1, false
      );
    }
  }, [phase, progressAngle, glowOpacity, circleScale, instructionOpacity, particleOpacity, circleRotation, starRotation]);

  // ─── Spin Phase ───────────────────────────────────────────

  const triggerSpin = useCallback(() => {
    setPhase('spinning');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    // Super fast rotation
    cancelAnimation(circleRotation);
    cancelAnimation(starRotation);

    circleRotation.value = withTiming(circleRotation.value + 360 * 8, {
      duration: SPIN_DURATION,
      easing: Easing.out(Easing.cubic),
    });
    starRotation.value = withTiming(starRotation.value - 360 * 12, {
      duration: SPIN_DURATION,
      easing: Easing.out(Easing.cubic),
    });

    // Particles go wild
    cancelAnimation(particle1Angle);
    cancelAnimation(particle2Angle);
    cancelAnimation(particle3Angle);
    cancelAnimation(particle4Angle);
    particle1Angle.value = withTiming(particle1Angle.value + Math.PI * 16, { duration: SPIN_DURATION, easing: Easing.out(Easing.cubic) });
    particle2Angle.value = withTiming(particle2Angle.value + Math.PI * 14, { duration: SPIN_DURATION, easing: Easing.out(Easing.cubic) });
    particle3Angle.value = withTiming(particle3Angle.value + Math.PI * 18, { duration: SPIN_DURATION, easing: Easing.out(Easing.cubic) });
    particle4Angle.value = withTiming(particle4Angle.value + Math.PI * 12, { duration: SPIN_DURATION, easing: Easing.out(Easing.cubic) });

    // Glow burst
    glowOpacity.value = withSequence(
      withTiming(1, { duration: 200 }),
      withTiming(0.6, { duration: SPIN_DURATION - 200, easing: Easing.out(Easing.ease) })
    );

    // Scale burst
    circleScale.value = withSequence(
      withSpring(1.2, { damping: 6, stiffness: 300 }),
      withTiming(1, { duration: 1500, easing: Easing.out(Easing.ease) })
    );

    // After spin: reveal result
    setTimeout(() => {
      if (selectedSign) {
        const result = getDailyHoroscope(selectedSign);
        setHoroscope(result);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Shrink circle away
      circleOpacity.value = withTiming(0, { duration: 500 });
      circleScale.value = withTiming(0.3, { duration: 500, easing: Easing.in(Easing.ease) });
      particleOpacity.value = withTiming(0, { duration: 400 });

      // Show result
      setTimeout(() => {
        setPhase('revealed');
        resultOpacity.value = withTiming(1, { duration: 600 });
        resultTranslateY.value = withSpring(0, { damping: 14, stiffness: 100 });
      }, 400);
    }, SPIN_DURATION);
  }, [selectedSign, circleRotation, starRotation, particle1Angle, particle2Angle, particle3Angle, particle4Angle, glowOpacity, circleScale, circleOpacity, particleOpacity, resultOpacity, resultTranslateY]);

  // ─── Reset ────────────────────────────────────────────────

  const handleReset = useCallback(() => {
    setPhase('selecting');
    setSelectedSign(null);
    setHoroscope(null);
    isPressing.current = false;

    // Reset all animations
    cancelAnimation(circleRotation);
    cancelAnimation(starRotation);
    cancelAnimation(particle1Angle);
    cancelAnimation(particle2Angle);
    cancelAnimation(particle3Angle);
    cancelAnimation(particle4Angle);

    circleRotation.value = 0;
    starRotation.value = 0;
    glowOpacity.value = 0.3;
    progressAngle.value = 0;
    circleScale.value = 1;
    circleOpacity.value = 1;
    particleOpacity.value = 0;
    resultOpacity.value = 0;
    resultTranslateY.value = 60;
    instructionOpacity.value = 1;
    weiterOpacity.value = 0;
    weiterTranslateY.value = 20;
  }, [circleRotation, starRotation, particle1Angle, particle2Angle, particle3Angle, particle4Angle, glowOpacity, progressAngle, circleScale, circleOpacity, particleOpacity, resultOpacity, resultTranslateY, instructionOpacity, weiterOpacity, weiterTranslateY]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    };
  }, []);

  // ─── Animated Styles ──────────────────────────────────────

  const weiterStyle = useAnimatedStyle(() => ({
    opacity: weiterOpacity.value,
    transform: [{ translateY: weiterTranslateY.value }],
  }));

  const circleContainerStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${circleRotation.value}deg` },
      { scale: circleScale.value },
    ],
    opacity: circleOpacity.value,
  }));

  const starStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${starRotation.value}deg` }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const instructionStyle = useAnimatedStyle(() => ({
    opacity: instructionOpacity.value,
  }));

  const makeParticleStyle = (angleValue: Animated.SharedValue<number>, radius: number) =>
    useAnimatedStyle(() => ({
      position: 'absolute' as const,
      left: CIRCLE_RADIUS + Math.cos(angleValue.value) * radius - 4,
      top: CIRCLE_RADIUS + Math.sin(angleValue.value) * radius - 4,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#C4B5FD',
      opacity: particleOpacity.value,
      shadowColor: '#A78BFA',
      shadowOpacity: 0.8,
      shadowRadius: 6,
    }));

  const p1Style = makeParticleStyle(particle1Angle, CIRCLE_RADIUS + 30);
  const p2Style = makeParticleStyle(particle2Angle, CIRCLE_RADIUS + 40);
  const p3Style = makeParticleStyle(particle3Angle, CIRCLE_RADIUS + 25);
  const p4Style = makeParticleStyle(particle4Angle, CIRCLE_RADIUS + 35);

  const resultStyle = useAnimatedStyle(() => ({
    opacity: resultOpacity.value,
    transform: [{ translateY: resultTranslateY.value }],
  }));

  // ─── Star SVG Path ────────────────────────────────────────

  const starPath = useMemo(() =>
    createStarPath(CIRCLE_RADIUS, CIRCLE_RADIUS, 40, 18, STAR_POINTS),
    []
  );

  const sign = selectedSign ? getZodiacById(selectedSign) : null;

  // ─── Render ───────────────────────────────────────────────

  return (
    <LinearGradient
      colors={['#0f0c29', '#302b63', '#24243e']}
      style={styles.root}
    >
      {/* Close Button */}
      <Pressable
        style={[styles.closeBtn, { top: insets.top + 12 }]}
        onPress={() => router.back()}
        hitSlop={16}
      >
        <Text style={styles.closeBtnText}>✕</Text>
      </Pressable>

      {/* ─── Phase: Selecting ─────────────────────────────── */}
      {phase === 'selecting' && (
        <ScrollView
          style={styles.selectingContainer}
          contentContainerStyle={[styles.selectingContent, { paddingTop: insets.top + 60, paddingBottom: 120 }]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.selectTitle}>Wähle dein Sternzeichen</Text>
          <Text style={styles.selectSubtitle}>
            Was verraten die Sterne heute über dich?
          </Text>

          <View style={styles.signGrid}>
            {ZODIAC_SIGNS.map((s) => (
              <Pressable
                key={s.id}
                style={[
                  styles.signCard,
                  selectedSign === s.id && styles.signCardSelected,
                ]}
                onPress={() => handleSelectSign(s.id)}
              >
                <Text style={styles.signSymbol}>{s.symbol}</Text>
                <Text style={[
                  styles.signName,
                  selectedSign === s.id && styles.signNameSelected,
                ]}>
                  {s.name}
                </Text>
                <Text style={styles.signDates}>{s.dateRange}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}

      {/* Weiter Button (Selecting phase) */}
      {phase === 'selecting' && selectedSign && (
        <Animated.View style={[styles.weiterContainer, weiterStyle, { bottom: insets.bottom + 24 }]}>
          <Pressable style={styles.weiterBtn} onPress={handleWeiter}>
            <Text style={styles.weiterText}>Weiter</Text>
          </Pressable>
        </Animated.View>
      )}

      {/* ─── Phase: Pressing / Spinning ──────────────────── */}
      {(phase === 'pressing' || phase === 'spinning') && (
        <View style={[styles.pressingContainer, { paddingTop: insets.top + 60 }]}>
          {/* Sign badge */}
          {sign && (
            <View style={styles.signBadge}>
              <Text style={styles.signBadgeSymbol}>{sign.symbol}</Text>
              <Text style={styles.signBadgeName}>{sign.name}</Text>
            </View>
          )}

          {/* Instruction */}
          <Animated.Text style={[styles.pressInstruction, instructionStyle]}>
            {phase === 'pressing'
              ? 'Halte deinen Daumen\nauf den Kreis'
              : 'Die Sterne enthüllen\ndein Schicksal...'}
          </Animated.Text>

          {/* Mystical Circle Area */}
          <View style={styles.circleArea}>
            {/* Glow background */}
            <Animated.View style={[styles.glowBg, glowStyle]}>
              <LinearGradient
                colors={['transparent', 'rgba(139, 92, 246, 0.3)', 'transparent']}
                style={styles.glowGradient}
              />
            </Animated.View>

            {/* Particles */}
            <View style={styles.particleContainer}>
              <Animated.View style={p1Style} />
              <Animated.View style={p2Style} />
              <Animated.View style={p3Style} />
              <Animated.View style={p4Style} />
            </View>

            {/* Main Circle */}
            <Pressable
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              disabled={phase === 'spinning'}
            >
              <Animated.View style={circleContainerStyle}>
                <Svg width={CIRCLE_SIZE} height={CIRCLE_SIZE}>
                  <Defs>
                    <RadialGradient id="circleGlow" cx="50%" cy="50%" r="50%">
                      <Stop offset="0%" stopColor="#7C3AED" stopOpacity="0.6" />
                      <Stop offset="70%" stopColor="#4C1D95" stopOpacity="0.3" />
                      <Stop offset="100%" stopColor="#1E1B4B" stopOpacity="0.1" />
                    </RadialGradient>
                  </Defs>

                  {/* Background fill */}
                  <Circle
                    cx={CIRCLE_RADIUS}
                    cy={CIRCLE_RADIUS}
                    r={CIRCLE_RADIUS - 4}
                    fill="url(#circleGlow)"
                  />

                  {/* Outer dashed ring */}
                  <Circle
                    cx={CIRCLE_RADIUS}
                    cy={CIRCLE_RADIUS}
                    r={CIRCLE_RADIUS - 4}
                    stroke="rgba(167, 139, 250, 0.5)"
                    strokeWidth={2}
                    strokeDasharray="8 6"
                    fill="none"
                  />

                  {/* Inner ring */}
                  <Circle
                    cx={CIRCLE_RADIUS}
                    cy={CIRCLE_RADIUS}
                    r={CIRCLE_RADIUS - 20}
                    stroke="rgba(196, 181, 253, 0.3)"
                    strokeWidth={1.5}
                    fill="none"
                  />
                </Svg>
              </Animated.View>

              {/* Star overlay (rotates independently) */}
              <Animated.View style={[styles.starOverlay, starStyle]}>
                <Svg width={CIRCLE_SIZE} height={CIRCLE_SIZE}>
                  <Path
                    d={starPath}
                    fill="rgba(196, 181, 253, 0.25)"
                    stroke="rgba(221, 214, 254, 0.6)"
                    strokeWidth={1.5}
                  />
                </Svg>
              </Animated.View>

              {/* Center fingerprint hint */}
              {phase === 'pressing' && (
                <View style={styles.fingerprintHint}>
                  <Text style={styles.fingerprintIcon}>👆</Text>
                </View>
              )}
            </Pressable>

            {/* Progress ring (rendered as a separate view) */}
            <Animated.View style={[styles.progressRingContainer, circleContainerStyle]}>
              <ProgressRing progress={progressAngle} size={CIRCLE_SIZE + 16} />
            </Animated.View>
          </View>
        </View>
      )}

      {/* ─── Phase: Revealed ─────────────────────────────── */}
      {phase === 'revealed' && horoscope && sign && (
        <Animated.View style={[styles.revealedContainer, resultStyle, { paddingTop: insets.top + 60 }]}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.revealedContent, { paddingBottom: insets.bottom + 100 }]}
          >
            {/* Sign Header */}
            <Text style={styles.revealedSymbol}>{sign.symbol}</Text>
            <Text style={styles.revealedName}>{sign.name}</Text>
            <Text style={styles.revealedDates}>{sign.dateRange}</Text>

            {/* Element Badge */}
            <View style={[styles.elementBadge, { backgroundColor: ELEMENT_COLORS[sign.element] + '30' }]}>
              <Text style={[styles.elementText, { color: ELEMENT_COLORS[sign.element] }]}>
                {sign.element}
              </Text>
            </View>

            {/* Trait */}
            <Text style={styles.traitText}>{sign.trait}</Text>

            {/* Divider */}
            <View style={styles.divider} />

            {/* Horoscope Text */}
            <Text style={styles.horoscopeTitle}>Dein Tageshoroskop</Text>
            <Text style={styles.horoscopeText}>{horoscope.text}</Text>

            {/* Ratings */}
            <View style={styles.ratingsContainer}>
              <RatingRow label="Liebe" emoji="❤️" value={horoscope.liebe} />
              <RatingRow label="Beruf" emoji="💼" value={horoscope.beruf} />
              <RatingRow label="Gesundheit" emoji="🌿" value={horoscope.gesundheit} />
            </View>
          </ScrollView>

          {/* Action Buttons */}
          <View style={[styles.actionButtons, { paddingBottom: insets.bottom + 24 }]}>
            <Pressable style={styles.resetBtn} onPress={handleReset}>
              <Text style={styles.resetBtnText}>Nochmal</Text>
            </Pressable>
            <Pressable style={styles.backBtn} onPress={() => router.back()}>
              <Text style={styles.backBtnText}>Zurück</Text>
            </Pressable>
          </View>
        </Animated.View>
      )}
    </LinearGradient>
  );
}

// ─── Progress Ring Component ────────────────────────────────

function ProgressRing({
  progress,
  size,
}: {
  progress: Animated.SharedValue<number>;
  size: number;
}) {
  const r = (size - 6) / 2;
  const circumference = 2 * Math.PI * r;

  const animatedStyle = useAnimatedStyle(() => {
    const dashOffset = circumference * (1 - progress.value / 360);
    return {
      strokeDashoffset: dashOffset,
    };
  });

  return (
    <Svg width={size} height={size} style={styles.progressSvg}>
      {/* Track */}
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="rgba(139, 92, 246, 0.15)"
        strokeWidth={3}
        fill="none"
      />
      {/* Animated progress - using Animated.View wrapper */}
      <AnimatedCircle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="#A78BFA"
        strokeWidth={3}
        fill="none"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeLinecap="round"
        animatedProps={animatedStyle}
        transform={`rotate(-90, ${size / 2}, ${size / 2})`}
      />
    </Svg>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ─── Rating Row Component ───────────────────────────────────

function RatingRow({ label, emoji, value }: { label: string; emoji: string; value: number }) {
  return (
    <View style={styles.ratingRow}>
      <Text style={styles.ratingEmoji}>{emoji}</Text>
      <Text style={styles.ratingLabel}>{label}</Text>
      <View style={styles.ratingDots}>
        {[1, 2, 3, 4, 5].map((i) => (
          <View
            key={i}
            style={[
              styles.ratingDot,
              i <= value ? styles.ratingDotFilled : styles.ratingDotEmpty,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

  // Close
  closeBtn: {
    position: 'absolute',
    left: 20,
    zIndex: 100,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#fff',
    fontSize: 18,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },

  // ─── Selecting Phase ────────────────────────────────────
  selectingContainer: {
    flex: 1,
  },
  selectingContent: {
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  selectTitle: {
    fontSize: 28,
    fontFamily: fontFamily.semiBold,
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  selectSubtitle: {
    fontSize: fontSize.md,
    fontFamily: fontFamily.regular,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginBottom: 28,
  },
  signGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
  },
  signCard: {
    width: '29%',
    aspectRatio: 0.85,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 8,
  },
  signCardSelected: {
    backgroundColor: 'rgba(139, 92, 246, 0.25)',
    borderColor: '#A78BFA',
    shadowColor: '#7C3AED',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  signSymbol: {
    fontSize: 32,
    marginBottom: 4,
  },
  signName: {
    fontSize: fontSize.sm,
    fontFamily: fontFamily.medium,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 2,
  },
  signNameSelected: {
    color: '#fff',
  },
  signDates: {
    fontSize: 10,
    fontFamily: fontFamily.regular,
    color: 'rgba(255,255,255,0.4)',
  },

  // Weiter Button
  weiterContainer: {
    position: 'absolute',
    left: 20,
    right: 20,
  },
  weiterBtn: {
    backgroundColor: '#7C3AED',
    borderRadius: borderRadius.xl,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#7C3AED',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  weiterText: {
    fontSize: fontSize.lg,
    fontFamily: fontFamily.semiBold,
    color: '#fff',
  },

  // ─── Pressing Phase ─────────────────────────────────────
  pressingContainer: {
    flex: 1,
    alignItems: 'center',
  },
  signBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 20,
    gap: 8,
  },
  signBadgeSymbol: {
    fontSize: 20,
  },
  signBadgeName: {
    fontSize: fontSize.md,
    fontFamily: fontFamily.medium,
    color: '#fff',
  },
  pressInstruction: {
    fontSize: fontSize.xl,
    fontFamily: fontFamily.medium,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: 40,
  },

  // Circle Area
  circleArea: {
    width: CIRCLE_SIZE + 80,
    height: CIRCLE_SIZE + 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowBg: {
    position: 'absolute',
    width: CIRCLE_SIZE * 2,
    height: CIRCLE_SIZE * 2,
    borderRadius: CIRCLE_SIZE,
  },
  glowGradient: {
    flex: 1,
    borderRadius: CIRCLE_SIZE,
  },
  starOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  fingerprintHint: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fingerprintIcon: {
    fontSize: 40,
    opacity: 0.5,
  },
  particleContainer: {
    position: 'absolute',
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
  },
  progressRingContainer: {
    position: 'absolute',
    top: -8,
    left: -8,
  },
  progressSvg: {
    transform: [{ rotate: '0deg' }],
  },

  // ─── Revealed Phase ─────────────────────────────────────
  revealedContainer: {
    flex: 1,
  },
  revealedContent: {
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  revealedSymbol: {
    fontSize: 64,
    marginBottom: 8,
  },
  revealedName: {
    fontSize: 32,
    fontFamily: fontFamily.semiBold,
    color: '#fff',
    marginBottom: 4,
  },
  revealedDates: {
    fontSize: fontSize.base,
    fontFamily: fontFamily.regular,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 12,
  },
  elementBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 8,
  },
  elementText: {
    fontSize: fontSize.sm,
    fontFamily: fontFamily.semiBold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  traitText: {
    fontSize: fontSize.md,
    fontFamily: fontFamily.medium,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 20,
  },
  divider: {
    width: 60,
    height: 2,
    backgroundColor: 'rgba(167, 139, 250, 0.4)',
    borderRadius: 1,
    marginBottom: 20,
  },
  horoscopeTitle: {
    fontSize: fontSize['2xl'],
    fontFamily: fontFamily.semiBold,
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },
  horoscopeText: {
    fontSize: fontSize.md,
    fontFamily: fontFamily.regular,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 28,
  },

  // Ratings
  ratingsContainer: {
    width: '100%',
    gap: 12,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: borderRadius.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  ratingEmoji: {
    fontSize: 20,
  },
  ratingLabel: {
    fontSize: fontSize.base,
    fontFamily: fontFamily.medium,
    color: 'rgba(255,255,255,0.8)',
    flex: 1,
  },
  ratingDots: {
    flexDirection: 'row',
    gap: 6,
  },
  ratingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  ratingDotFilled: {
    backgroundColor: '#A78BFA',
    shadowColor: '#7C3AED',
    shadowOpacity: 0.6,
    shadowRadius: 4,
  },
  ratingDotEmpty: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },

  // Action Buttons
  actionButtons: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    backgroundColor: 'rgba(15, 12, 41, 0.9)',
  },
  resetBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: borderRadius.lg,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  resetBtnText: {
    color: '#fff',
    fontSize: fontSize.base,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
  backBtn: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: borderRadius.lg,
    paddingVertical: 14,
    alignItems: 'center',
  },
  backBtnText: {
    color: '#0f0c29',
    fontSize: fontSize.base,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
});
