import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { useTheme } from '@/context/ThemeContext';
import { useRewards } from '@/context/RewardsContext';
import { useSnackbar } from '@/context/SnackbarContext';
import { equipUserReward } from '@/lib/supabase-rewards';
import type { LootboxRewardRarity, LootboxRewardType } from '@/lib/supabase-rewards';
import RarityPill from '@/components/rewards/RarityPill';
import { RARITY_COLOR } from '@/lib/rarity';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

/**
 * Decide where "Jetzt ausprobieren" should push based on reward type.
 * Equippable cosmetics (frames, banners, badges) go to the profile so the
 * user can see them applied. Stickers / animated stickers also go to the
 * profile for now — the post + event-experience integrations are future work,
 * and the user's inventory is viewable on the profile.
 */
function tryItRouteFor(type: LootboxRewardType): string {
  switch (type) {
    case 'profile_frame':
    case 'profile_banner':
    case 'badge':
      return '/profile';
    case 'sticker':
    case 'animated_sticker':
      return '/profile';
    case 'coin_bundle':
      return '/rewards';
    default:
      return '/profile';
  }
}

/**
 * Which reward types auto-equip when the user taps "Jetzt ausprobieren".
 * Cosmetics do; stickers/animated stickers don't (they're selected per post).
 */
const AUTO_EQUIP_TYPES: LootboxRewardType[] = ['profile_frame', 'profile_banner', 'badge'];

export default function RewardScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
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
  const coinValue = params.coin_value ? Number(params.coin_value) : 0;

  const [isTrying, setIsTrying] = useState(false);

  const handleTryNow = async () => {
    setIsTrying(true);
    try {
      if (params.id && AUTO_EQUIP_TYPES.includes(type)) {
        const ok = await equipUserReward(params.id, true);
        if (ok) {
          if (Platform.OS !== 'web') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          }
          showSnackbar({ message: 'Angezogen' });
          await refresh();
        }
      }
      router.replace(tryItRouteFor(type) as any);
    } finally {
      setIsTrying(false);
    }
  };

  const handleLater = () => {
    router.replace('/rewards/schatzkammer' as any);
  };

  const rarityColor = RARITY_COLOR[rarity];
  const assetUrl = params.asset_url || '';
  const hasAsset = !!assetUrl;

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <View style={styles.header}>
        <Pressable
          onPress={handleLater}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
          accessibilityLabel="Zurück"
        >
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.rarityRow}>
          <RarityPill rarity={rarity} size="medium" />
        </View>

        <View
          style={[
            styles.artBox,
            {
              backgroundColor: isDark ? colors.surface : '#FFFFFF',
              borderColor: rarityColor,
              shadowColor: rarityColor,
            },
          ]}
        >
          {hasAsset ? (
            <Image source={{ uri: assetUrl }} style={styles.art} resizeMode="contain" />
          ) : (
            <Text style={styles.artFallback}>🎁</Text>
          )}
        </View>

        <Text style={[styles.headline, { color: colors.textPrimary }]}>
          Du hast gewonnen!
        </Text>
        <Text style={[styles.rewardName, { color: colors.textPrimary }]}>
          {params.name || 'Belohnung'}
        </Text>
        {!!params.description && (
          <Text style={[styles.rewardDescription, { color: colors.textSecondary }]}>
            {params.description}
          </Text>
        )}

        {type === 'coin_bundle' && coinValue > 0 && (
          <View style={[styles.coinBundleRow, { backgroundColor: '#FFFBEA', borderColor: '#E9B949' }]}>
            <Text style={styles.coinBundleText}>+{coinValue} Münzen gutgeschrieben</Text>
          </View>
        )}
      </ScrollView>

      <SafeAreaView
        edges={['bottom']}
        style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}
      >
        <Pressable
          onPress={handleTryNow}
          disabled={isTrying}
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: colors.primary, opacity: pressed || isTrying ? 0.85 : 1 },
          ]}
        >
          {isTrying ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryText}>Jetzt austesten</Text>
          )}
        </Pressable>
        <Pressable
          onPress={handleLater}
          style={({ pressed }) => [styles.linkBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[styles.linkText, { color: colors.textSecondary }]}>
            Später ausprobieren
          </Text>
        </Pressable>
      </SafeAreaView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 20,
    paddingBottom: 24,
    alignItems: 'center',
    gap: 14,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  rarityRow: {
    alignSelf: 'center',
  },
  artBox: {
    width: '78%',
    aspectRatio: 1,
    borderRadius: 24,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginTop: 8,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 8,
  },
  art: {
    width: '85%',
    height: '85%',
  },
  artFallback: {
    fontSize: 96,
  },
  headline: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    marginTop: 8,
  },
  rewardName: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 24,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  rewardDescription: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 20,
    marginTop: -4,
  },
  coinBundleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 6,
  },
  coinBundleText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: '#8A5A00',
  },
  actions: {
    width: '100%',
    gap: 4,
    marginTop: 18,
  },
  primaryBtn: {
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    color: '#fff',
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
  },
  linkBtn: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  linkText: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
  },
});
