import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  useWindowDimensions,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  withDelay,
  withRepeat,
  interpolate,
  runOnJS,
  useFrameCallback,
  Easing,
  Extrapolation,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily, fontSize, borderRadius } from '@/constants/theme';
import {
  CATEGORY_COLORS,
  getDailyCard,
  getRandomRevealLine,
  MECKY_LINES,
  type FortuneCard,
} from '@/lib/fortune-cards';

// ─── Constants ───────────────────────────────────────────────

const NUM_DECK_CARDS = 20;
const ANGLE_PER_CARD = 7; // degrees between cards
const PIVOT_DISTANCE = 380; // pivot point below card bottom
const FRICTION = 0.975;
const MIN_VELOCITY = 0.3; // degrees per frame
const CARD_W = 60;
const CARD_H = 90;
const SELECTED_CARD_W = 220;
const SELECTED_CARD_H = 320;

type Phase = 'idle' | 'spinning' | 'stopped' | 'rising' | 'flipping' | 'revealed';

// ─── Main Component ──────────────────────────────────────────

export default function FortuneCardsGame() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const { isDark } = useTheme();

  const [phase, setPhase] = useState<Phase>('idle');
  const [dailyCard] = useState<FortuneCard>(getDailyCard());
  const [meckyText, setMeckyText] = useState(MECKY_LINES.idle);
  const [showFront, setShowFront] = useState(false);

  // Spin physics — all in degrees now
  const rotationAngle = useSharedValue(0); // degrees offset
  const spinVelocity = useSharedValue(0); // degrees per frame
  const isSpinning = useSharedValue(0);

  // Selected card animations
  const selectedY = useSharedValue(100);
  const selectedScale = useSharedValue(0.5);
  const selectedOpacity = useSharedValue(0);
  const flipProgress = useSharedValue(0);

  // Deck fade & slide
  const deckOpacity = useSharedValue(1);
  const deckSlideY = useSharedValue(0);

  // CTA opacity (always rendered, fade in/out)
  const ctaOpacity = useSharedValue(1);

  // Center card highlight when spin stops
  const highlightCenter = useSharedValue(0);

  // Mecky animations
  const meckyBounce = useSharedValue(0);
  const meckyScale = useSharedValue(1);

  // Sparkle
  const sparkleOpacity = useSharedValue(0);
  const sparkleScale = useSharedValue(0.5);

  // Result view
  const resultOpacity = useSharedValue(0);

  // ─── Named callback wrappers for runOnJS ───────────────────

  const triggerHapticLight = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const animateMeckyExcitement = useCallback(() => {
    meckyScale.value = withSequence(
      withSpring(1.15, { damping: 4, stiffness: 200 }),
      withSpring(1, { damping: 8, stiffness: 150 })
    );
  }, [meckyScale]);

  const startSpinning = useCallback(() => {
    setPhase('spinning');
    setMeckyText(MECKY_LINES.spinning);
    ctaOpacity.value = withTiming(0, { duration: 200 });
  }, [ctaOpacity]);

  // ─── Idle Mecky Float ───────────────────────────────────────

  useEffect(() => {
    meckyBounce.value = withRepeat(
      withSequence(
        withTiming(-8, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(8, { duration: 1500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  // ─── Spin Physics ──────────────────────────────────────────

  const onSpinStop = useCallback(() => {
    setPhase('stopped');
    setMeckyText('Tippe auf die Karte!');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    highlightCenter.value = withTiming(1, { duration: 400 });
  }, [highlightCenter]);

  useFrameCallback(() => {
    'worklet';
    if (isSpinning.value !== 1) return;

    spinVelocity.value *= FRICTION;
    rotationAngle.value += spinVelocity.value;

    if (Math.abs(spinVelocity.value) < MIN_VELOCITY) {
      isSpinning.value = 0;
      spinVelocity.value = 0;

      // Snap to nearest card position
      const snapped = Math.round(rotationAngle.value / ANGLE_PER_CARD) * ANGLE_PER_CARD;
      rotationAngle.value = withTiming(snapped, { duration: 300, easing: Easing.out(Easing.cubic) });

      runOnJS(onSpinStop)();
    }
  });

  // ─── Swipe Gesture ─────────────────────────────────────────

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-15, 15])
        .onEnd((e) => {
          'worklet';
          if (isSpinning.value === 1) return;
          // Convert velocity to degrees: velocityX px/s → degrees/frame
          const vDeg = (e.velocityX / 500) * 8;
          if (Math.abs(vDeg) > 1) {
            spinVelocity.value = vDeg;
            isSpinning.value = 1;
            runOnJS(startSpinning)();
            runOnJS(triggerHapticLight)();
            runOnJS(animateMeckyExcitement)();
          }
        }),
    [isSpinning, spinVelocity, startSpinning, triggerHapticLight, animateMeckyExcitement]
  );

  // ─── Card Flip ─────────────────────────────────────────────

  const handleCardTap = useCallback(() => {
    if (phase !== 'stopped') return;
    setPhase('rising');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    // Deck slides down, highlight off
    deckSlideY.value = withTiming(300, { duration: 500, easing: Easing.in(Easing.cubic) });
    deckOpacity.value = withTiming(0, { duration: 500 });
    highlightCenter.value = withTiming(0, { duration: 200 });

    // After short delay, selected card rises up
    setTimeout(() => {
      selectedOpacity.value = withTiming(1, { duration: 300 });
      selectedScale.value = withSpring(1, { damping: 12, stiffness: 100 });
      selectedY.value = withSpring(0, { damping: 14, stiffness: 80 });
      sparkleOpacity.value = withDelay(400, withTiming(1, { duration: 400 }));
      sparkleScale.value = withDelay(400, withSpring(1, { damping: 10, stiffness: 120 }));
    }, 200);

    // Start flip after card is centered
    setTimeout(() => {
      setPhase('flipping');
      flipProgress.value = withTiming(1, {
        duration: 800,
        easing: Easing.inOut(Easing.cubic),
      });
    }, 800);

    // Show front at flip midpoint
    setTimeout(() => {
      setShowFront(true);
    }, 1200);

    // Reveal result
    setTimeout(() => {
      setPhase('revealed');
      setMeckyText(getRandomRevealLine());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      resultOpacity.value = withTiming(1, { duration: 500 });
      meckyScale.value = withSequence(
        withSpring(1.2, { damping: 4, stiffness: 200 }),
        withSpring(1, { damping: 8, stiffness: 150 })
      );
    }, 1600);
  }, [phase, flipProgress, resultOpacity, meckyScale, deckSlideY, deckOpacity, highlightCenter, selectedOpacity, selectedScale, selectedY, sparkleOpacity, sparkleScale]);

  // ─── Reset ─────────────────────────────────────────────────

  const handleReset = useCallback(() => {
    setPhase('idle');
    setMeckyText(MECKY_LINES.idle);
    setShowFront(false);

    rotationAngle.value = 0;
    spinVelocity.value = 0;
    isSpinning.value = 0;
    selectedY.value = 100;
    selectedScale.value = 0.5;
    selectedOpacity.value = 0;
    flipProgress.value = 0;
    deckOpacity.value = withTiming(1, { duration: 400 });
    deckSlideY.value = 0;
    ctaOpacity.value = withTiming(1, { duration: 300 });
    highlightCenter.value = 0;
    sparkleOpacity.value = 0;
    sparkleScale.value = 0.5;
    resultOpacity.value = 0;
  }, [rotationAngle, spinVelocity, isSpinning, selectedY, selectedScale, selectedOpacity, flipProgress, deckOpacity, deckSlideY, ctaOpacity, highlightCenter, sparkleOpacity, sparkleScale, resultOpacity]);

  // ─── Animated Styles ───────────────────────────────────────

  const meckyStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: meckyBounce.value },
      { scale: meckyScale.value },
    ],
  }));

  const deckContainerStyle = useAnimatedStyle(() => ({
    opacity: deckOpacity.value,
    transform: [{ translateY: deckSlideY.value }],
  }));

  const ctaAnimStyle = useAnimatedStyle(() => ({
    opacity: ctaOpacity.value,
  }));

  const selectedCardStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(
      flipProgress.value,
      [0, 0.5, 1],
      [0, 90, 0],
      Extrapolation.CLAMP
    );
    return {
      opacity: selectedOpacity.value,
      transform: [
        { translateY: selectedY.value },
        { scale: selectedScale.value },
        { perspective: 1000 },
        { rotateY: `${rotateY}deg` },
      ],
    };
  });

  const sparkleStyle = useAnimatedStyle(() => ({
    opacity: sparkleOpacity.value,
    transform: [{ scale: sparkleScale.value }],
  }));

  const resultStyle = useAnimatedStyle(() => ({
    opacity: resultOpacity.value,
  }));

  // ─── Render ────────────────────────────────────────────────

  const bgGradient = ['#1a1a2e', '#16213e', '#0f3460'] as const;
  const showDeck = phase === 'idle' || phase === 'spinning' || phase === 'stopped' || phase === 'rising';
  const showSelected = phase === 'rising' || phase === 'flipping' || phase === 'revealed';

  // Fan card positions: all anchored at bottom center
  const fanAnchorX = W / 2 - CARD_W / 2;

  const renderDeckCards = () => {
    const cards = [];
    for (let i = 0; i < NUM_DECK_CARDS; i++) {
      cards.push(
        <FanCard
          key={i}
          index={i}
          total={NUM_DECK_CARDS}
          anchorX={fanAnchorX}
          rotationAngle={rotationAngle}
          highlightCenter={highlightCenter}
        />
      );
    }
    return cards;
  };

  return (
    <View style={styles.root}>
      <LinearGradient colors={bgGradient} style={styles.root}>
        {/* Close Button */}
        <Pressable
          style={[styles.closeBtn, { top: insets.top + 12 }]}
          onPress={() => router.back()}
          hitSlop={16}
        >
          <Text style={styles.closeBtnText}>✕</Text>
        </Pressable>

        {/* Mecky Section */}
        <View style={[styles.meckySection, { paddingTop: insets.top + 56 }]}>
          <Animated.View style={meckyStyle}>
            <Image
              source={require('@/assets/games/mecky/mecky_main.png')}
              style={styles.meckyImage}
              resizeMode="contain"
            />
          </Animated.View>
          <View style={styles.speechBubble}>
            <Text style={styles.speechText}>{meckyText}</Text>
            <View style={styles.speechTail} />
          </View>
        </View>

        {/* Card Fan Deck */}
        {showDeck && (
          <GestureDetector gesture={panGesture}>
            <Animated.View style={[styles.fanContainer, deckContainerStyle]}>
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={handleCardTap}
                disabled={phase !== 'stopped'}
              />
              {renderDeckCards()}
            </Animated.View>
          </GestureDetector>
        )}

        {/* CTA text — below the fan, always rendered with animated opacity */}
        {showDeck && (
          <Animated.View style={[styles.ctaContainer, { paddingBottom: insets.bottom + 16 }, ctaAnimStyle]}>
            <Text style={styles.ctaArrow}>▲</Text>
            <Text style={styles.ctaText}>Wische um die Karten zu drehen</Text>
          </Animated.View>
        )}

        {/* Selected Card (Rising + Flipping) */}
        {showSelected && (
          <View style={styles.selectedArea}>
            <Animated.View style={[styles.sparkleContainer, sparkleStyle]}>
              <Text style={styles.sparkle1}>✨</Text>
              <Text style={styles.sparkle2}>⭐</Text>
              <Text style={styles.sparkle3}>💫</Text>
              <Text style={styles.sparkle4}>✨</Text>
            </Animated.View>

            <Pressable onPress={handleCardTap} disabled={phase !== 'flipping' && phase !== 'revealed'}>
              <Animated.View style={[styles.selectedCard, selectedCardStyle]}>
                {showFront ? (
                  <CardFront card={dailyCard} />
                ) : (
                  <CardBack />
                )}
              </Animated.View>
            </Pressable>
          </View>
        )}

        {/* Result Section */}
        {phase === 'revealed' && (
          <Animated.View style={[styles.resultSection, resultStyle]}>
            <Text style={styles.resultSpruch}>„{dailyCard.spruch}"</Text>
            <Text style={styles.resultBeschreibung}>{dailyCard.beschreibung}</Text>

            <View style={styles.resultButtons}>
              <Pressable style={styles.resetBtn} onPress={handleReset}>
                <Text style={styles.resetBtnText}>Nochmal drehen</Text>
              </Pressable>
              <Pressable style={styles.backBtn} onPress={() => router.back()}>
                <Text style={styles.backBtnText}>Zurück</Text>
              </Pressable>
            </View>
          </Animated.View>
        )}
      </LinearGradient>
    </View>
  );
}

// ─── Fan Card Component ──────────────────────────────────────

type FanCardProps = {
  index: number;
  total: number;
  anchorX: number;
  rotationAngle: Animated.SharedValue<number>;
  highlightCenter: Animated.SharedValue<number>;
};

function FanCard({ index, total, anchorX, rotationAngle, highlightCenter }: FanCardProps) {
  const centerIndex = (total - 1) / 2;
  const baseAngle = (index - centerIndex) * ANGLE_PER_CARD;
  const fanWidth = total * ANGLE_PER_CARD;
  const halfFan = fanWidth / 2;

  const animStyle = useAnimatedStyle(() => {
    // Compute raw angle and wrap for infinite loop
    const rawAngle = baseAngle + rotationAngle.value;
    let angle = ((rawAngle + halfFan) % fanWidth);
    if (angle < 0) angle += fanWidth;
    angle -= halfFan;

    // Center card highlight: pop up and scale when near center
    const isCenter = Math.abs(angle) < ANGLE_PER_CARD * 0.6 ? 1 : 0;
    const highlight = highlightCenter.value * isCenter;
    const extraY = interpolate(highlight, [0, 1], [0, -20]);
    const extraScale = interpolate(highlight, [0, 1], [1, 1.15]);

    return {
      position: 'absolute' as const,
      left: anchorX,
      bottom: CARD_H * 0.15,
      width: CARD_W,
      height: CARD_H,
      transform: [
        { translateY: PIVOT_DISTANCE + extraY },
        { rotate: `${angle}deg` },
        { translateY: -PIVOT_DISTANCE },
        { scale: extraScale },
      ],
    };
  });

  return (
    <Animated.View style={animStyle}>
      <MiniCardBack />
    </Animated.View>
  );
}

// ─── Mini Card Back (deck card) ──────────────────────────────

function MiniCardBack() {
  return (
    <LinearGradient
      colors={['#5C6BC0', '#283593', '#1A237E']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.miniCard}
    >
      <View style={styles.miniCardGoldBorder}>
        <View style={styles.miniCardCenter}>
          <Text style={styles.miniCardDiamond}>◆</Text>
          <Text style={styles.miniCardSymbol}>☽</Text>
          <Text style={styles.miniCardDiamond}>◆</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

// ─── Full Card Back ──────────────────────────────────────────

function CardBack() {
  return (
    <LinearGradient
      colors={['#5C6BC0', '#283593', '#1A237E']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.fullCardBack}
    >
      <View style={styles.fullCardBackInner}>
        <Text style={styles.fullCardSymbol}>☽</Text>
        <Text style={styles.fullCardStars}>✦ ✦ ✦</Text>
        <View style={styles.fullCardOrnament}>
          <Text style={styles.ornamentText}>✧</Text>
        </View>
      </View>
      <View style={styles.fullCardBorder} />
    </LinearGradient>
  );
}

// ─── Full Card Front ─────────────────────────────────────────

function CardFront({ card }: { card: FortuneCard }) {
  const categoryGradient = CATEGORY_COLORS[card.category];
  return (
    <View style={styles.fullCardFront}>
      <LinearGradient
        colors={[categoryGradient[0] + '20', '#ffffff']}
        style={styles.fullCardFrontGradient}
      >
        <View style={[styles.categoryBadge, { backgroundColor: card.farbe + '25' }]}>
          <Text style={[styles.categoryText, { color: card.farbe }]}>
            {card.category === 'liebe' ? 'Liebe' :
             card.category === 'kraft' ? 'Kraft' :
             card.category === 'weisheit' ? 'Weisheit' :
             card.category === 'glueck' ? 'Glück' : 'Wandel'}
          </Text>
        </View>
        <Text style={styles.frontEmoji}>{card.emoji}</Text>
        <Text style={styles.frontName}>{card.name}</Text>
        <View style={[styles.frontDivider, { backgroundColor: card.farbe }]} />
        <Text style={styles.frontSpruch} numberOfLines={4}>
          „{card.spruch}"
        </Text>
      </LinearGradient>
      <View style={[styles.frontAccent, { backgroundColor: card.farbe }]} />
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

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

  meckySection: {
    alignItems: 'center',
    paddingBottom: 8,
  },
  meckyImage: {
    width: 120,
    height: 120,
  },
  speechBubble: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginTop: 8,
    maxWidth: 260,
    alignItems: 'center',
  },
  speechText: {
    fontSize: fontSize.base,
    fontFamily: fontFamily.medium,
    color: '#1a1a2e',
    textAlign: 'center',
    lineHeight: 20,
  },
  speechTail: {
    position: 'absolute',
    top: -8,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'rgba(255,255,255,0.95)',
  },

  // Fan deck container — fills remaining space, no clip
  fanContainer: {
    flex: 1,
    position: 'relative',
    marginBottom: 20,
  },

  // CTA below fan
  ctaContainer: {
    alignItems: 'center',
    paddingTop: 4,
  },
  ctaArrow: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    marginBottom: 4,
  },
  ctaText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: fontSize.sm,
    fontFamily: 'MonaSansSemiCondensed-Bold',
    textAlign: 'center',
  },

  // Mini Card (fan card back)
  miniCard: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#CFB53B', // gold border
  },
  miniCardGoldBorder: {
    width: CARD_W - 8,
    height: CARD_H - 8,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(207,181,59,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  miniCardCenter: {
    alignItems: 'center',
    gap: 2,
  },
  miniCardDiamond: {
    fontSize: 8,
    color: 'rgba(207,181,59,0.6)',
  },
  miniCardSymbol: {
    fontSize: 22,
    color: 'rgba(255,255,255,0.85)',
  },

  // Selected Card Area
  selectedArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedCard: {
    width: SELECTED_CARD_W,
    height: SELECTED_CARD_H,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#7C4DFF',
    shadowOpacity: 0.4,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 10 },
    elevation: 20,
  },

  // Full Card Back
  fullCardBack: {
    flex: 1,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  fullCardBackInner: {
    width: SELECTED_CARD_W - 20,
    height: SELECTED_CARD_H - 20,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(207,181,59,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullCardSymbol: {
    fontSize: 56,
    color: 'rgba(255,255,255,0.8)',
  },
  fullCardStars: {
    fontSize: 14,
    color: 'rgba(207,181,59,0.5)',
    marginTop: 12,
    letterSpacing: 8,
  },
  fullCardOrnament: {
    position: 'absolute',
    bottom: 20,
  },
  ornamentText: {
    fontSize: 20,
    color: 'rgba(207,181,59,0.4)',
  },
  fullCardBorder: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: 4,
    bottom: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(207,181,59,0.15)',
  },

  // Full Card Front
  fullCardFront: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  fullCardFrontGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  categoryBadge: {
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 12,
  },
  categoryText: {
    fontSize: fontSize.xs,
    fontFamily: fontFamily.semiBold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  frontEmoji: {
    fontSize: 56,
    marginBottom: 8,
  },
  frontName: {
    fontSize: fontSize['2xl'],
    fontFamily: fontFamily.semiBold,
    color: '#1a1a2e',
    marginBottom: 8,
  },
  frontDivider: {
    width: 40,
    height: 3,
    borderRadius: 2,
    marginBottom: 14,
  },
  frontSpruch: {
    fontSize: fontSize.base,
    fontFamily: fontFamily.medium,
    color: '#374151',
    textAlign: 'center',
    lineHeight: 22,
  },
  frontAccent: {
    height: 5,
  },

  // Sparkles
  sparkleContainer: {
    position: 'absolute',
    width: 300,
    height: 400,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sparkle1: { position: 'absolute', top: 20, left: 20, fontSize: 24 },
  sparkle2: { position: 'absolute', top: 40, right: 30, fontSize: 20 },
  sparkle3: { position: 'absolute', bottom: 40, left: 40, fontSize: 22 },
  sparkle4: { position: 'absolute', bottom: 20, right: 20, fontSize: 18 },

  // Result
  resultSection: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 28,
    paddingBottom: 50,
    alignItems: 'center',
  },
  resultSpruch: {
    fontSize: fontSize.lg,
    fontFamily: fontFamily.medium,
    color: '#fff',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  resultBeschreibung: {
    fontSize: fontSize.sm,
    fontFamily: fontFamily.regular,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  resultButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  resetBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: borderRadius.lg,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  resetBtnText: {
    color: '#fff',
    fontSize: fontSize.base,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
  backBtn: {
    backgroundColor: '#fff',
    borderRadius: borderRadius.lg,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  backBtnText: {
    color: '#1a1a2e',
    fontSize: fontSize.base,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
});
