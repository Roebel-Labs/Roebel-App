import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useActiveAccount } from 'thirdweb/react';
import { useInterest } from '@/context/InterestContext';
import { useTheme } from '@/context/ThemeContext';
import type { InterestedUser } from '@/lib/supabase-interests';

export const ORB_SIZE = 52;
const ORB_RING = 2;

// Four slots hugging the flyer's edges: top-left, top-right, left just below
// the middle, right around the middle. The last one is the signed-in
// person's own home (see below), so it sits nearest the CTA.
const SLOTS = [
  { top: -8, left: -12 },
  { top: -6, right: -14 },
  { top: '54%', left: -18 },
  { top: '44%', right: -14 },
] as const;

// Springs up from below the flyer, overshoots a touch, settles. A fresh
// builder per orb: Keyframe's `.delay()` mutates the instance, so sharing
// one across the stagger would give every orb the last delay.
function orbEnter(delayMs: number) {
  return new Keyframe({
    0: { opacity: 0, transform: [{ translateY: 48 }, { scale: 0.3 }] },
    65: {
      opacity: 1,
      transform: [{ translateY: -8 }, { scale: 1.08 }],
      easing: Easing.out(Easing.cubic),
    },
    100: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }], easing: Easing.inOut(Easing.quad) },
  })
    .duration(560)
    .delay(delayMs);
}

function orbExit() {
  return new Keyframe({
    0: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] },
    100: {
      opacity: 0,
      transform: [{ translateY: 40 }, { scale: 0.3 }],
      easing: Easing.in(Easing.cubic),
    },
  }).duration(300);
}

/**
 * Interested people floating on the event flyer (detail page). Reads the
 * batched preview from InterestContext; because toggleInterest updates
 * that preview optimistically, the signed-in person's orb springs onto the
 * flyer the moment "Interessiert" is pressed and drops away when pressed
 * again. Their orb always takes the last slot so nobody else shifts.
 * People without a profile picture show as a matte grey sphere.
 */
export default function InterestOrbs({ eventId }: { eventId: string }) {
  const { getPreview, isInterested } = useInterest();
  const account = useActiveAccount();
  const { colors } = useTheme();
  const preview = getPreview(eventId);
  const me = account?.address?.toLowerCase();
  const interested = isInterested(eventId);

  const slots = useMemo<(InterestedUser | null)[]>(() => {
    const users = preview?.users ?? [];
    const self = me ? users.find((u) => u.wallet_address.toLowerCase() === me) : undefined;
    const others = users.filter((u) => u !== self);
    return [
      others[0] ?? null,
      others[1] ?? null,
      others[2] ?? null,
      self && interested ? self : (others[3] ?? null),
    ];
  }, [preview, me, interested]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {slots.map((user, i) =>
        user ? (
          <Animated.View
            key={user.wallet_address.toLowerCase()}
            entering={orbEnter(i * 70)}
            exiting={orbExit()}
            style={[styles.orb, SLOTS[i], { borderColor: colors.background }]}
          >
            {user.profile_picture_url ? (
              <Image
                source={{ uri: user.profile_picture_url }}
                style={styles.face}
                contentFit="cover"
                cachePolicy="memory-disk"
                accessibilityIgnoresInvertColors
              />
            ) : (
              <LinearGradient
                colors={['#dcdcdc', '#8e8e8e', '#3a3a3a']}
                locations={[0, 0.45, 1]}
                start={{ x: 0.15, y: 0.1 }}
                end={{ x: 0.85, y: 0.95 }}
                style={styles.face}
              />
            )}
          </Animated.View>
        ) : null
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  orb: {
    position: 'absolute',
    width: ORB_SIZE,
    height: ORB_SIZE,
    borderRadius: ORB_SIZE / 2,
    borderWidth: ORB_RING,
    overflow: 'hidden',
    backgroundColor: '#8e8e8e',
  },
  face: {
    width: ORB_SIZE - ORB_RING * 2,
    height: ORB_SIZE - ORB_RING * 2,
    borderRadius: (ORB_SIZE - ORB_RING * 2) / 2,
  },
});
