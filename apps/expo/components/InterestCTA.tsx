import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Animated, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useActiveAccount } from 'thirdweb/react';
import { useInterest } from '@/context/InterestContext';
import { useTheme } from '@/context/ThemeContext';
import { HeartIcon, HeartFilledIcon } from './Icons';
import AvatarStack from './AvatarStack';
import { InterestedUser } from '@/lib/supabase-interests';

type InterestCTAProps = {
  eventId: string;
};

const HEART_PNG = require('@/assets/icons/Heart.png');

export default function InterestCTA({ eventId }: InterestCTAProps) {
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

  useEffect(() => {
    refreshCount(eventId);
    getInterestedUsers(eventId, 5).then(setUsers);
  }, [eventId]);

  const handleToggle = useCallback(async () => {
    if (!account?.address || toggling) return;

    setToggling(true);
    const wasInterested = interested;

    if (!wasInterested) {
      outlineOpacity.setValue(0);
      pngOpacity.setValue(1);
      pngScale.setValue(0);
      pngRotate.setValue(0);

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
      // Smooth fade transition — no shrink animation
      Animated.parallel([
        Animated.timing(filledScale, {
          toValue: 1,
          duration: 0,
          useNativeDriver: true,
        }),
        Animated.timing(outlineOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
      filledScale.setValue(0);
    }

    try {
      await toggleInterest(eventId);
      getInterestedUsers(eventId, 5).then(setUsers);
    } catch {
      // Context handles revert
    } finally {
      setToggling(false);
    }
  }, [account, toggling, interested, eventId]);

  const rotateInterpolation = pngRotate.interpolate({
    inputRange: [0, 1, 2],
    outputRange: ['0deg', '-15deg', '5deg'],
  });

  const displayCount = count ?? 0;
  const avatarUsers = users.map((u) => ({
    avatar_url: u.profile_picture_url,
    username: u.username,
  }));

  const countText = interested
    ? displayCount > 1
      ? `Du und ${displayCount - 1} weitere sind interessiert`
      : 'Du bist interessiert'
    : displayCount > 0
      ? `${displayCount} Personen sind interessiert`
      : 'Sei der Erste, der Interesse zeigt';

  const isActive = interested;

  return (
    <View style={styles.container}>
      <Pressable
        onPress={handleToggle}
        disabled={!account?.address}
        style={({ pressed }) => [
          styles.button,
          isActive
            ? [styles.buttonActive, { borderColor: colors.primary }]
            : { backgroundColor: colors.primary },
          pressed && styles.buttonPressed,
          !account?.address && styles.buttonDisabled,
        ]}
        accessibilityRole="button"
        accessibilityLabel={interested ? 'Interesse entfernen' : 'Interessiert'}
      >
        <View style={styles.buttonIconWrap}>
          {/* Outline heart (default) — bottom layer */}
          <Animated.View style={[styles.iconBottom, { opacity: outlineOpacity }]}>
            <HeartIcon size={20} color={isActive ? colors.primary : '#fff'} />
          </Animated.View>

          {/* Filled heart — middle layer, revealed after PNG fades */}
          <Animated.View
            style={[
              styles.iconMid,
              {
                opacity: interested ? 1 : 0,
                transform: [{ scale: filledScale }],
              },
            ]}
          >
            <HeartFilledIcon size={20} color={colors.primary} />
          </Animated.View>

          {/* Heart.png plop — top layer, sits above both SVG hearts on Android */}
          <Animated.View
            style={[
              styles.iconTop,
              {
                opacity: pngOpacity,
                transform: [
                  { scale: pngScale },
                  { rotate: rotateInterpolation },
                ],
              },
            ]}
          >
            <Image source={HEART_PNG} style={{ width: 28, height: 28 }} contentFit="contain" />
          </Animated.View>
        </View>

        <Text
          style={[
            styles.buttonText,
            isActive ? { color: colors.primary } : { color: '#fff' },
          ]}
        >
          Interessiert
        </Text>
      </Pressable>

      {(displayCount > 0 || interested) && (
        <View style={styles.socialRow}>
          {avatarUsers.length > 0 && (
            <AvatarStack
              users={avatarUsers}
              maxVisible={4}
              size="large"
              totalCount={displayCount}
            />
          )}
          <Text style={[styles.socialText, { color: colors.textSecondary }]}>
            {countText}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
    gap: 10,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  buttonActive: {
    backgroundColor: '#fff',
    borderWidth: 2,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonIconWrap: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'visible',
  },
  iconBottom: {
    position: 'absolute',
    zIndex: 0,
  },
  iconMid: {
    position: 'absolute',
    zIndex: 1,
  },
  iconTop: {
    position: 'absolute',
    zIndex: 2,
  },
  buttonText: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
  },
  buttonTextActive: {
    // Color set dynamically via inline style using colors.primary
  },
  socialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  socialText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    flex: 1,
  },
});
