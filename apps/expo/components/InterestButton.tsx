import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Animated, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useActiveAccount } from 'thirdweb/react';
import { useInterest } from '@/context/InterestContext';
import { useTheme } from '@/context/ThemeContext';
import { HeartIcon, HeartFilledIcon } from './Icons';
import AvatarStack from './AvatarStack';
import { InterestedUser } from '@/lib/supabase-interests';

type InterestButtonProps = {
  eventId: string;
  compact?: boolean;
  /** Icon-only mode: just the heart icon, no avatar stack or text. Replaces bookmark. */
  iconOnly?: boolean;
};

const HEART_PNG = require('@/assets/icons/Heart.png');

export default function InterestButton({ eventId, compact = false, iconOnly = false }: InterestButtonProps) {
  const account = useActiveAccount();
  const { colors } = useTheme();
  const { isInterested, toggleInterest, getCount, refreshCount, getInterestedUsers } = useInterest();

  const interested = isInterested(eventId);
  const count = getCount(eventId);
  const [users, setUsers] = useState<InterestedUser[]>([]);
  const [toggling, setToggling] = useState(false);

  // Animation values
  const pngScale = useRef(new Animated.Value(0)).current;
  const pngRotate = useRef(new Animated.Value(0)).current;
  const pngOpacity = useRef(new Animated.Value(0)).current;
  const filledScale = useRef(new Animated.Value(interested ? 1 : 0)).current;
  const outlineOpacity = useRef(new Animated.Value(interested ? 0 : 1)).current;

  // Fetch count + users on mount
  useEffect(() => {
    refreshCount(eventId);
    if (!iconOnly) {
      getInterestedUsers(eventId, compact ? 2 : 3).then(setUsers);
    }
  }, [eventId, iconOnly]);

  const handleToggle = useCallback(async () => {
    if (!account?.address || toggling) return;

    setToggling(true);
    const wasInterested = interested;

    if (!wasInterested) {
      // Activate animation: outline hides → Heart.png plops → filled appears
      outlineOpacity.setValue(0);
      pngOpacity.setValue(1);
      pngScale.setValue(0);
      pngRotate.setValue(0);

      // Phase 1: Scale up with rotation
      Animated.spring(pngScale, {
        toValue: 1.5,
        damping: 6,
        stiffness: 250,
        useNativeDriver: true,
      }).start();

      Animated.spring(pngRotate, {
        toValue: 1,
        damping: 6,
        stiffness: 250,
        useNativeDriver: true,
      }).start();

      // Phase 2: Hold, then scale down and fade
      setTimeout(() => {
        Animated.parallel([
          Animated.spring(pngScale, {
            toValue: 0.85,
            damping: 10,
            stiffness: 200,
            useNativeDriver: true,
          }),
          Animated.spring(pngRotate, {
            toValue: 2,
            damping: 10,
            stiffness: 200,
            useNativeDriver: true,
          }),
        ]).start();
      }, 350);

      // Phase 3: Fade out Heart.png, show filled heart
      setTimeout(() => {
        Animated.timing(pngOpacity, {
          toValue: 0,
          duration: 100,
          useNativeDriver: true,
        }).start();

        filledScale.setValue(0.85);
        Animated.spring(filledScale, {
          toValue: 1,
          damping: 12,
          stiffness: 200,
          useNativeDriver: true,
        }).start();
      }, 500);
    } else {
      // Deactivate: smooth fade transition, no shrink
      filledScale.setValue(0);
      Animated.timing(outlineOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }

    try {
      await toggleInterest(eventId);
      // Refresh users list
      getInterestedUsers(eventId, compact ? 2 : 3).then(setUsers);
    } catch {
      // Context handles revert
    } finally {
      setToggling(false);
    }
  }, [account, toggling, interested, eventId, compact]);

  const rotateInterpolation = pngRotate.interpolate({
    inputRange: [0, 1, 2],
    outputRange: ['0deg', '-15deg', '5deg'],
  });

  const iconSize = compact ? 16 : 20;
  const pngSize = compact ? 24 : 32;
  const avatarUsers = users.map((u) => ({
    avatar_url: u.profile_picture_url,
    username: u.username,
  }));

  const displayCount = count ?? 0;
  const countText = interested
    ? displayCount > 1
      ? `Du + ${displayCount - 1} weitere`
      : 'Du bist interessiert'
    : `${displayCount} interessiert`;

  const heartButton = (
    <Pressable
      onPress={handleToggle}
      disabled={!account?.address}
      style={({ pressed }) => [
        styles.heartBtn,
        pressed && styles.heartBtnPressed,
        !account?.address && styles.heartBtnDisabled,
      ]}
      accessibilityRole="button"
      accessibilityLabel={interested ? 'Interesse entfernen' : 'Interessiert'}
    >
      <View style={styles.heartIconWrap}>
        {/* Outline heart */}
        <Animated.View style={[styles.iconAbsolute, { opacity: outlineOpacity }]}>
          <HeartIcon size={iconSize} color={colors.primary} />
        </Animated.View>

        {/* Heart.png (plop animation) */}
        <Animated.View
          style={[
            styles.iconAbsolute,
            {
              opacity: pngOpacity,
              transform: [
                { scale: pngScale },
                { rotate: rotateInterpolation },
              ],
            },
          ]}
        >
          <Image source={HEART_PNG} style={{ width: pngSize, height: pngSize }} contentFit="contain" />
        </Animated.View>

        {/* Filled heart */}
        <Animated.View
          style={[
            styles.iconAbsolute,
            {
              opacity: interested ? 1 : 0,
              transform: [{ scale: filledScale }],
            },
          ]}
        >
          <HeartFilledIcon size={iconSize} color={colors.primary} />
        </Animated.View>
      </View>
    </Pressable>
  );

  if (iconOnly) {
    return heartButton;
  }

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      <View style={styles.leftSection}>
        {displayCount > 0 && (
          <AvatarStack
            users={avatarUsers}
            maxVisible={compact ? 2 : 3}
            size="small"
            totalCount={displayCount}
          />
        )}
        <Text
          style={[
            styles.countText,
            compact && styles.countTextCompact,
            { color: colors.textSecondary },
          ]}
          numberOfLines={1}
        >
          {countText}
        </Text>
      </View>

      {heartButton}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
  containerCompact: {
    paddingTop: 6,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  countText: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
  },
  countTextCompact: {
    fontSize: 10,
  },
  heartBtn: {
    padding: 4,
  },
  heartBtnPressed: {
    opacity: 0.7,
  },
  heartBtnDisabled: {
    opacity: 0.5,
  },
  heartIconWrap: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconAbsolute: {
    position: 'absolute',
  },
});
