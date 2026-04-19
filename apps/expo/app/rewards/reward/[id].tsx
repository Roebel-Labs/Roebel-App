import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/context/ThemeContext';
import { useRewards } from '@/context/RewardsContext';
import { useSnackbar } from '@/context/SnackbarContext';
import { equipUserReward } from '@/lib/supabase-rewards';
import type { LootboxRewardRarity, LootboxRewardType } from '@/lib/supabase-rewards';

const CHEST = require('../../../assets/illustration/gamification/lootbox.png');

const RARITY_LABEL: Record<LootboxRewardRarity, string> = {
  common: 'Gewöhnlich',
  rare: 'Selten',
  epic: 'Episch',
  legendary: 'Legendär',
};

const RARITY_COLOR: Record<LootboxRewardRarity, string> = {
  common: '#94A3B8',
  rare: '#3B82F6',
  epic: '#8B5CF6',
  legendary: '#F59E0B',
};

const EQUIPPABLE_TYPES: LootboxRewardType[] = [
  'profile_frame',
  'profile_banner',
  'sticker',
  'animated_sticker',
  'badge',
];

export default function RewardRevealScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { showSnackbar } = useSnackbar();
  const { refresh } = useRewards();
  const params = useLocalSearchParams<{
    id: string;
    name?: string;
    description?: string;
    asset_url?: string;
    rarity?: LootboxRewardRarity;
    type?: LootboxRewardType;
    coin_value?: string;
  }>();

  const rarity = (params.rarity as LootboxRewardRarity) || 'common';
  const type = (params.type as LootboxRewardType) || 'sticker';
  const isEquippable = EQUIPPABLE_TYPES.includes(type);
  const coinValue = params.coin_value ? Number(params.coin_value) : 0;

  const [revealed, setRevealed] = useState(false);
  const [isEquipping, setIsEquipping] = useState(false);

  const shake = useRef(new Animated.Value(0)).current;
  const chestFade = useRef(new Animated.Value(1)).current;
  const rewardFade = useRef(new Animated.Value(0)).current;
  const rewardScale = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    // Shake chest 3 times then reveal.
    const shakeAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(shake, {
          toValue: 1,
          duration: 80,
          useNativeDriver: true,
          easing: Easing.linear,
        }),
        Animated.timing(shake, {
          toValue: -1,
          duration: 80,
          useNativeDriver: true,
          easing: Easing.linear,
        }),
        Animated.timing(shake, {
          toValue: 0,
          duration: 80,
          useNativeDriver: true,
          easing: Easing.linear,
        }),
      ]),
      { iterations: 3 }
    );

    shakeAnim.start(() => {
      setRevealed(true);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      Animated.parallel([
        Animated.timing(chestFade, {
          toValue: 0,
          duration: 350,
          useNativeDriver: true,
        }),
        Animated.timing(rewardFade, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.spring(rewardScale, {
          toValue: 1,
          friction: 6,
          tension: 70,
          useNativeDriver: true,
        }),
      ]).start();
    });

    return () => {
      shakeAnim.stop();
    };
  }, [chestFade, rewardFade, rewardScale, shake]);

  const handleEquip = async () => {
    if (!params.id) return;
    setIsEquipping(true);
    try {
      const ok = await equipUserReward(params.id, true);
      if (ok) {
        showSnackbar({ message: 'Angezogen' });
        void refresh();
      } else {
        showSnackbar({ message: 'Konnte nicht angezogen werden' });
      }
    } finally {
      setIsEquipping(false);
    }
  };

  const handleClose = () => {
    router.back();
  };

  const shakeTranslate = shake.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [-8, 0, 8],
  });

  const rarityColor = RARITY_COLOR[rarity];

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={revealed ? handleClose : undefined} />
      <View style={[styles.card, { backgroundColor: colors.background }]}>
        <View style={[styles.rarityStrip, { backgroundColor: rarityColor }]} />

        <View style={styles.artArea}>
          <Animated.View
            style={[
              StyleSheet.absoluteFillObject,
              styles.centered,
              {
                opacity: chestFade,
                transform: [{ translateX: shakeTranslate }, { rotate: '-4deg' }],
              },
            ]}
          >
            <Image source={CHEST} style={styles.chest} resizeMode="contain" />
          </Animated.View>
          <Animated.View
            style={[
              StyleSheet.absoluteFillObject,
              styles.centered,
              {
                opacity: rewardFade,
                transform: [{ scale: rewardScale }],
              },
            ]}
          >
            {params.asset_url ? (
              <Image
                source={{ uri: params.asset_url }}
                style={styles.rewardImg}
                resizeMode="contain"
              />
            ) : (
              <Text style={styles.rewardFallback}>🎁</Text>
            )}
          </Animated.View>
        </View>

        {revealed && (
          <>
            <Text style={[styles.rarityLabel, { color: rarityColor }]}>
              {RARITY_LABEL[rarity]}
            </Text>
            <Text style={[styles.rewardName, { color: colors.textPrimary }]}>
              {params.name || 'Belohnung'}
            </Text>
            {!!params.description && (
              <Text style={[styles.rewardDesc, { color: colors.textSecondary }]}>
                {params.description}
              </Text>
            )}
            {type === 'coin_bundle' && coinValue > 0 && (
              <Text style={[styles.bonusText, { color: '#E9B949' }]}>
                +{coinValue} Münzen gutgeschrieben
              </Text>
            )}

            <View style={styles.actions}>
              {isEquippable && (
                <Pressable
                  onPress={handleEquip}
                  disabled={isEquipping}
                  style={({ pressed }) => [
                    styles.secondaryBtn,
                    { borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
                  ]}
                >
                  <Text style={[styles.secondaryText, { color: colors.textPrimary }]}>
                    {isEquipping ? 'Bitte warten…' : 'Anziehen'}
                  </Text>
                </Pressable>
              )}
              <Pressable
                onPress={handleClose}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Text style={styles.primaryText}>Weiter</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    width: '100%',
    borderRadius: 24,
    overflow: 'hidden',
    paddingBottom: 20,
    maxWidth: 420,
  },
  rarityStrip: {
    height: 6,
  },
  artArea: {
    width: '100%',
    aspectRatio: 1,
    marginTop: -4,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  chest: {
    width: '72%',
    height: '72%',
  },
  rewardImg: {
    width: '68%',
    height: '68%',
  },
  rewardFallback: {
    fontSize: 96,
  },
  rarityLabel: {
    alignSelf: 'center',
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  rewardName: {
    textAlign: 'center',
    fontFamily: 'Inter-SemiBold',
    fontSize: 22,
    marginTop: 6,
    paddingHorizontal: 20,
  },
  rewardDesc: {
    textAlign: 'center',
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    marginTop: 6,
    paddingHorizontal: 24,
  },
  bonusText: {
    textAlign: 'center',
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
    marginTop: 10,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    marginTop: 18,
  },
  secondaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
  },
  primaryBtn: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: '#fff',
  },
});
