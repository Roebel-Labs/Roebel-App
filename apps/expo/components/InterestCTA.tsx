import React, { useCallback, useState } from 'react';
import { Text, Pressable, Animated, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useActiveAccount } from 'thirdweb/react';
import { useInterest } from '@/context/InterestContext';
import { useTheme } from '@/context/ThemeContext';
import { useRequireAuth } from '@/context/AuthGateContext';
import { fontFamily } from '@/constants/theme';
import { HeartIcon, HeartFilledIcon } from './Icons';

export const INTEREST_CTA_HEIGHT = 54;

const HEART_PNG = require('@/assets/icons/Heart.png');

/**
 * The detail page's primary action, pinned to the bottom of the screen:
 * a full-width "Interessiert" button that flips to an outlined "Du bist
 * interessiert". Interest state, count and the avatar previews all live in
 * InterestContext (updated optimistically on press), so the flyer orbs and
 * the social row react without this button knowing about them.
 */
export default function InterestCTA({ eventId }: { eventId: string }) {
  const account = useActiveAccount();
  const { colors } = useTheme();
  const requireAuth = useRequireAuth();
  const { isInterested, toggleInterest } = useInterest();

  const interested = isInterested(eventId);
  const [toggling, setToggling] = useState(false);

  // Heart "plop": the PNG heart scales up with a tilt, settles, fades and
  // hands over to the filled SVG heart.
  // Lazy state, not refs: stable Animated.Values without reading a ref
  // during render (React Compiler rule).
  const [pngScale] = useState(() => new Animated.Value(0));
  const [pngRotate] = useState(() => new Animated.Value(0));
  const [pngOpacity] = useState(() => new Animated.Value(0));
  const [filledScale] = useState(() => new Animated.Value(interested ? 1 : 0));
  const [outlineOpacity] = useState(() => new Animated.Value(interested ? 0 : 1));

  const handleToggle = useCallback(async () => {
    if (toggling) return;
    if (!account?.address) {
      requireAuth(() => {});
      return;
    }

    setToggling(true);
    const wasInterested = interested;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    if (!wasInterested) {
      outlineOpacity.setValue(0);
      pngOpacity.setValue(1);
      pngScale.setValue(0);
      pngRotate.setValue(0);

      Animated.spring(pngScale, { toValue: 1.5, damping: 6, stiffness: 250, useNativeDriver: true }).start();
      Animated.spring(pngRotate, { toValue: 1, damping: 6, stiffness: 250, useNativeDriver: true }).start();

      setTimeout(() => {
        Animated.parallel([
          Animated.spring(pngScale, { toValue: 0.85, damping: 10, stiffness: 200, useNativeDriver: true }),
          Animated.spring(pngRotate, { toValue: 2, damping: 10, stiffness: 200, useNativeDriver: true }),
        ]).start();
      }, 350);

      setTimeout(() => {
        Animated.timing(pngOpacity, { toValue: 0, duration: 100, useNativeDriver: true }).start();
        filledScale.setValue(0.85);
        Animated.spring(filledScale, { toValue: 1, damping: 12, stiffness: 200, useNativeDriver: true }).start();
      }, 500);
    } else {
      filledScale.setValue(0);
      Animated.timing(outlineOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }

    try {
      await toggleInterest(eventId);
    } catch {
      // Context reverts the optimistic state.
    } finally {
      setToggling(false);
    }
  }, [account, toggling, interested, eventId, requireAuth, toggleInterest, outlineOpacity, pngOpacity, pngScale, pngRotate, filledScale]);

  const rotateInterpolation = pngRotate.interpolate({
    inputRange: [0, 1, 2],
    outputRange: ['0deg', '-15deg', '5deg'],
  });

  const iconColor = interested ? colors.primary : colors.onPrimary;

  return (
    <Pressable
      onPress={handleToggle}
      style={({ pressed }) => [
        styles.button,
        interested
          ? { backgroundColor: colors.background, borderColor: colors.primary }
          : { backgroundColor: colors.primary, borderColor: colors.primary },
        pressed && styles.buttonPressed,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: interested }}
      accessibilityLabel={interested ? 'Interesse entfernen' : 'Interessiert'}
    >
      <View style={styles.iconWrap}>
        <Animated.View style={[styles.iconLayer, { opacity: outlineOpacity }]}>
          <HeartIcon size={20} color={iconColor} />
        </Animated.View>
        <Animated.View
          style={[styles.iconLayer, { opacity: interested ? 1 : 0, transform: [{ scale: filledScale }] }]}
        >
          <HeartFilledIcon size={20} color={colors.primary} />
        </Animated.View>
        <Animated.View
          style={[
            styles.iconLayer,
            styles.iconTop,
            { opacity: pngOpacity, transform: [{ scale: pngScale }, { rotate: rotateInterpolation }] },
          ]}
        >
          <Image source={HEART_PNG} style={styles.png} contentFit="contain" />
        </Animated.View>
      </View>
      <Text style={[styles.label, { color: interested ? colors.primary : colors.onPrimary }]}>
        {interested ? 'Du bist interessiert' : 'Interessiert'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: INTEREST_CTA_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 24,
    borderRadius: 14,
    borderWidth: 2,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  iconWrap: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'visible',
  },
  iconLayer: {
    position: 'absolute',
  },
  iconTop: {
    zIndex: 2,
  },
  png: {
    width: 28,
    height: 28,
  },
  label: {
    fontSize: 16,
    fontFamily: fontFamily.heading,
  },
});
