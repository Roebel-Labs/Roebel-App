import React, { useCallback, useRef } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Animated, {
  Easing,
  Extrapolation,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import PressableScale from '@/components/PressableScale';
import type { RegisterCard } from '@/lib/credreg/model';
import CredentialCard from './CredentialCard';
import type { Holder } from '@/lib/card-design/holder-values';

/** Visible height of the front card above the content sheet. */
export const CARD_PEEK_FRONT = 64;
/** Vertical offset between stacked cards. */
export const CARD_PEEK_STEP = 44;
/** Gap between the header and the first card. */
export const STACK_TOP = 12;
/** Cards behind the front one are drawn narrower (centred) for depth. */
export const BACK_CARD_SCALE = 0.93;

/**
 * Wallet reveal (Max 2026-11-21): the cards appear LAST — they wait until the screen (and on the
 * first open the entry skeleton) is shown, then rise from behind the sheet one after another — and
 * disappear FIRST: on blur they sink behind the sheet faster than the screen fades out.
 */
const REVEAL_DELAY_FIRST_MS = 620; // entry skeleton min (350) + its fade (220) + a beat
const REVEAL_DELAY_MS = 120;
const REVEAL_MS = 420;
const HIDE_MS = 150; // < the 220 ms screen fade
const REVEAL_DROP = 56; // px the cards start below their place (behind the sheet)
const STAGGER = 0.18; // share of the progress each further card waits

function useWalletReveal(): SharedValue<number> {
  const reduced = useReducedMotion();
  const progress = useSharedValue(reduced ? 1 : 0);
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (reduced) {
        progress.value = 1;
        return undefined;
      }
      const delay = firstFocus.current ? REVEAL_DELAY_FIRST_MS : REVEAL_DELAY_MS;
      firstFocus.current = false;
      cancelAnimation(progress);
      progress.value = withDelay(delay, withTiming(1, { duration: REVEAL_MS, easing: Easing.out(Easing.cubic) }));
      return () => {
        cancelAnimation(progress);
        progress.value = withTiming(0, { duration: HIDE_MS, easing: Easing.in(Easing.quad) });
      };
    }, [progress, reduced]),
  );
  return progress;
}

/** One card's slice of the reveal: back cards rise first, the front card last. */
function RevealCard({
  progress,
  index,
  count,
  style,
  children,
}: {
  progress: SharedValue<number>;
  index: number;
  count: number;
  style: object;
  children: React.ReactNode;
}) {
  const start = Math.min(index * STAGGER, 0.6);
  const animated = useAnimatedStyle(() => {
    const t = interpolate(progress.value, [start, Math.min(start + 0.7, 1)], [0, 1], Extrapolation.CLAMP);
    return { opacity: t, transform: [{ translateY: (1 - t) * REVEAL_DROP }] };
  });
  void count;
  return <Animated.View style={[styles.card, style, animated]}>{children}</Animated.View>;
}

export function stackHeight(count: number): number {
  return CARD_PEEK_STEP * Math.max(0, count - 1) + CARD_PEEK_FRONT;
}

type Props = {
  /** Back → front (the profile model's order). */
  cards: RegisterCard[];
  onPress: (card: RegisterCard) => void;
  /** The holder: fills the name field of designed cards (on this device only). */
  holder?: Holder | null;
  /** The front card's sheen follows the phone (off while a detail sheet shows the card). */
  animateFront?: boolean;
};

/**
 * The wallet peek at the top of the profile: cards are absolutely placed so
 * only their top band shows; the sheet that follows in flow covers the rest.
 * The zone must not clip (cards overflow downward on purpose).
 *
 * Built-in cards only (today's profile): one press zone that opens the front card, exactly as
 * before. With register cards each visible band is its own button.
 */
export default function CredentialCardStack({ cards, onPress, holder = null, animateFront = true }: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const reveal = useWalletReveal(); // before the early return (hook order)
  const cardWidth = screenWidth - 32;
  if (cards.length === 0) return null;
  const front = cards[cards.length - 1];
  const builtinOnly = cards.every((c) => c.source === 'builtin');

  const placed = cards.map((card, index) => {
    const isFront = index === cards.length - 1;
    const width = isFront ? cardWidth : Math.round(cardWidth * BACK_CARD_SCALE);
    const left = 16 + (cardWidth - width) / 2;
    const top = STACK_TOP + index * CARD_PEEK_STEP;
    return { card, width, left, top, isFront };
  });

  if (builtinOnly) {
    return (
      <PressableScale
        scaleTo={0.985}
        haptic="selection"
        onPress={() => onPress(front)}
        accessibilityRole="button"
        accessibilityLabel={`${front.title} anzeigen`}
        style={[styles.zone, { height: STACK_TOP + stackHeight(cards.length) }]}
      >
        {placed.map(({ card, width, left, top, isFront }, index) => (
          <RevealCard key={card.key} progress={reveal} index={index} count={placed.length} style={{ top, left }}>
            <CredentialCard card={card} width={width} animate={isFront && animateFront ? 'tilt' : 'static'} />
          </RevealCard>
        ))}
      </PressableScale>
    );
  }

  return (
    <View style={[styles.zone, { height: STACK_TOP + stackHeight(cards.length) }]}>
      {placed.map(({ card, width, left, top, isFront }, index) => (
        <RevealCard key={card.key} progress={reveal} index={index} count={placed.length} style={{ top, left, width, height: isFront ? CARD_PEEK_FRONT : CARD_PEEK_STEP }}>
        <Pressable
          onPress={() => onPress(card)}
          accessibilityRole="button"
          accessibilityLabel={`${card.title} anzeigen`}
          // Only the visible band of a back card takes touches; the front card takes its whole peek.
          // (Positioned by its RevealCard wrapper.)
          style={styles.fill}
        >
          {/* Only the front card follows the tilt; the cards behind are drawn once. */}
          <CredentialCard card={card} width={width} holder={holder} animate={isFront && animateFront ? 'tilt' : 'static'} />
        </Pressable>
        </RevealCard>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  zone: {
    overflow: 'visible',
    zIndex: 1,
  },
  card: {
    position: 'absolute',
  },
  fill: {
    flex: 1,
  },
});
