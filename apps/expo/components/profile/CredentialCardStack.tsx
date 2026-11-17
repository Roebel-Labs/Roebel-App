import React from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import PressableScale from '@/components/PressableScale';
import type { RegisterCard } from '@/lib/credreg/model';
import CredentialCard from './CredentialCard';

/** Visible height of the front card above the content sheet. */
export const CARD_PEEK_FRONT = 64;
/** Vertical offset between stacked cards. */
export const CARD_PEEK_STEP = 44;
/** Gap between the header and the first card. */
export const STACK_TOP = 12;
/** Cards behind the front one are drawn narrower (centred) for depth. */
export const BACK_CARD_SCALE = 0.93;

export function stackHeight(count: number): number {
  return CARD_PEEK_STEP * Math.max(0, count - 1) + CARD_PEEK_FRONT;
}

type Props = {
  /** Back → front (the profile model's order). */
  cards: RegisterCard[];
  onPress: (card: RegisterCard) => void;
};

/**
 * The wallet peek at the top of the profile: cards are absolutely placed so
 * only their top band shows; the sheet that follows in flow covers the rest.
 * The zone must not clip (cards overflow downward on purpose).
 *
 * Built-in cards only (today's profile): one press zone that opens the front card, exactly as
 * before. With register cards each visible band is its own button.
 */
export default function CredentialCardStack({ cards, onPress }: Props) {
  const { width: screenWidth } = useWindowDimensions();
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
        {placed.map(({ card, width, left, top }) => (
          <CredentialCard key={card.key} card={card} width={width} style={[styles.card, { top, left }]} />
        ))}
      </PressableScale>
    );
  }

  return (
    <View style={[styles.zone, { height: STACK_TOP + stackHeight(cards.length) }]}>
      {placed.map(({ card, width, left, top, isFront }) => (
        <Pressable
          key={card.key}
          onPress={() => onPress(card)}
          accessibilityRole="button"
          accessibilityLabel={`${card.title} anzeigen`}
          // Only the visible band of a back card takes touches; the front card takes its whole peek.
          style={[styles.card, { top, left, width, height: isFront ? CARD_PEEK_FRONT : CARD_PEEK_STEP }]}
        >
          <CredentialCard card={card} width={width} />
        </Pressable>
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
});
