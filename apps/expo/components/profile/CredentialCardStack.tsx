import React from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import PressableScale from '@/components/PressableScale';
import { CREDENTIAL_COPY, type CredentialKind } from '@/lib/credentials';
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
  /** Back → front. */
  kinds: CredentialKind[];
  onPress: (front: CredentialKind) => void;
};

/**
 * The wallet peek at the top of the profile: cards are absolutely placed so
 * only their top band shows; the sheet that follows in flow covers the rest.
 * The zone must not clip (cards overflow downward on purpose).
 */
export default function CredentialCardStack({ kinds, onPress }: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = screenWidth - 32;
  const front = kinds[kinds.length - 1];

  return (
    <PressableScale
      scaleTo={0.985}
      haptic="selection"
      onPress={() => onPress(front)}
      accessibilityRole="button"
      accessibilityLabel={`${CREDENTIAL_COPY[front].title} anzeigen`}
      style={[styles.zone, { height: STACK_TOP + stackHeight(kinds.length) }]}
    >
      {kinds.map((kind, index) => {
        const isFront = index === kinds.length - 1;
        const width = isFront ? cardWidth : Math.round(cardWidth * BACK_CARD_SCALE);
        const left = 16 + (cardWidth - width) / 2;
        return (
          <CredentialCard
            key={kind}
            kind={kind}
            width={width}
            style={[styles.card, { top: STACK_TOP + index * CARD_PEEK_STEP, left }]}
          />
        );
      })}
    </PressableScale>
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
