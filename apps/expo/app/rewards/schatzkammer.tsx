import React, { useCallback, useMemo, useState } from 'react';
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
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { useTheme } from '@/context/ThemeContext';
import { useRewards } from '@/context/RewardsContext';
import { useUser } from '@/context/UserContext';
import { useSnackbar } from '@/context/SnackbarContext';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import BottomDrawer from '@/components/BottomDrawer';
import LootboxCard from '@/components/rewards/LootboxCard';
import KeyInventoryBadge from '@/components/rewards/KeyInventoryBadge';
import type { Lootbox, LootboxReward, LootboxRewardRarity } from '@/lib/supabase-rewards';

const HERO = require('../../assets/illustration/gamification/treasury_chamber.png');
const COIN_SMALL = require('../../assets/illustration/gamification/single.png');

const RARITY_COLOR: Record<LootboxRewardRarity, string> = {
  common: '#94A3B8',
  rare: '#3B82F6',
  epic: '#8B5CF6',
  legendary: '#F59E0B',
};

export default function SchatzkammerScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { isConnected } = useUser();
  const { showSnackbar } = useSnackbar();
  const {
    coins,
    keyCount,
    lootboxes,
    userRewards,
    buyKey,
    openChest,
    refresh,
    isLoading,
  } = useRewards();

  const [buySheetLootbox, setBuySheetLootbox] = useState<Lootbox | null>(null);
  const [isBuying, setIsBuying] = useState(false);
  const [isOpening, setIsOpening] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const handleChestPress = useCallback(
    async (lootbox: Lootbox) => {
      if (!isConnected) {
        showSnackbar({ message: 'Bitte zuerst anmelden' });
        return;
      }
      if (keyCount < 1) {
        setBuySheetLootbox(lootbox);
        return;
      }
      setIsOpening(lootbox.id);
      try {
        const res = await openChest(lootbox.id);
        if (!res.success) {
          if (res.error === 'no_key') {
            setBuySheetLootbox(lootbox);
          } else {
            showSnackbar({ message: 'Öffnen fehlgeschlagen. Bitte nochmal.' });
          }
          return;
        }
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        }
        // Push reveal modal with reward data serialised into params.
        router.push({
          pathname: '/rewards/reward/[id]',
          params: {
            id: res.user_reward_id || 'unknown',
            name: res.name || 'Belohnung',
            description: res.description || '',
            asset_url: res.asset_url || '',
            rarity: res.rarity || 'common',
            type: res.type || 'sticker',
            coin_value: res.coin_value ? String(res.coin_value) : '',
          },
        } as any);
      } finally {
        setIsOpening(null);
      }
    },
    [isConnected, keyCount, openChest, router, showSnackbar]
  );

  const handleBuyKey = useCallback(async () => {
    if (!buySheetLootbox) return;
    setIsBuying(true);
    try {
      const res = await buyKey(buySheetLootbox.id);
      if (res.success) {
        if (Platform.OS !== 'web') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        }
        showSnackbar({
          message: `Schlüssel gekauft (–${buySheetLootbox.coins_per_key} Münzen)`,
        });
        const lootbox = buySheetLootbox;
        setBuySheetLootbox(null);
        // Auto-open the chest the user tapped.
        setTimeout(() => handleChestPress(lootbox), 300);
      } else if (res.error === 'insufficient_balance') {
        showSnackbar({ message: 'Nicht genug Münzen' });
      } else {
        showSnackbar({ message: 'Fehler beim Kauf' });
      }
    } finally {
      setIsBuying(false);
    }
  }, [buyKey, buySheetLootbox, handleChestPress, showSnackbar]);

  const chestsInRows = useMemo(() => {
    const rows: Lootbox[][] = [];
    for (let i = 0; i < lootboxes.length; i += 3) {
      rows.push(lootboxes.slice(i, i + 3));
    }
    return rows;
  }, [lootboxes]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <SafeAreaView style={styles.absoluteHeader} edges={['top']} pointerEvents="box-none">
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
            accessibilityRole="button"
          >
            <ChevronLeftIcon width={24} height={24} color="#000" />
          </Pressable>
          <KeyInventoryBadge />
        </View>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        style={styles.scrollRoot}
      >
        <Image source={HERO} style={styles.hero} resizeMode="cover" />
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.background, borderTopColor: colors.border },
          ]}
        >
          <Text style={[styles.title, { color: colors.textPrimary }]}>Schatzkammer</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Verdiene Schlüssel und öffne Truhen von Mecky
          </Text>

          <View
            style={[
              styles.balanceRow,
              {
                backgroundColor: isDark ? colors.surface : '#F9FAFB',
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.balanceItem}>
              <Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>
                Münzen
              </Text>
              <View style={styles.balanceInline}>
                <Image source={COIN_SMALL} style={styles.balanceIcon} resizeMode="contain" />
                <Text style={[styles.balanceValue, { color: colors.textPrimary }]}>
                  {coins.toLocaleString('de-DE')}
                </Text>
              </View>
            </View>
            <View style={[styles.balanceDivider, { backgroundColor: colors.border }]} />
            <View style={styles.balanceItem}>
              <Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>
                Schlüssel
              </Text>
              <View style={styles.balanceInline}>
                <Text style={styles.balanceKeyEmoji}>🗝️</Text>
                <Text style={[styles.balanceValue, { color: colors.textPrimary }]}>
                  {keyCount}
                </Text>
              </View>
            </View>
          </View>

          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Truhen</Text>

          {isLoading && lootboxes.length === 0 ? (
            <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
          ) : (
            <View style={styles.grid}>
              {chestsInRows.map((row, i) => (
                <View key={`row-${i}`} style={styles.row}>
                  {row.map((lootbox) => (
                    <LootboxCard
                      key={lootbox.id}
                      lootbox={lootbox}
                      hasKey={keyCount > 0}
                      canAfford={coins >= lootbox.coins_per_key}
                      onPress={() => handleChestPress(lootbox)}
                    />
                  ))}
                  {Array.from({ length: 3 - row.length }).map((_, idx) => (
                    <View key={`fill-${i}-${idx}`} style={styles.filler} />
                  ))}
                </View>
              ))}
            </View>
          )}

          {userRewards.length > 0 && (
            <>
              <Text
                style={[
                  styles.sectionTitle,
                  { color: colors.textPrimary, marginTop: 24 },
                ]}
              >
                Meine Belohnungen
              </Text>
              <View style={styles.rewardsGrid}>
                {userRewards.map((r) => (
                  <UserRewardThumb
                    key={r.id}
                    reward={r.reward}
                    equipped={r.is_equipped}
                    isDark={isDark}
                  />
                ))}
              </View>
            </>
          )}

          {isOpening && (
            <ActivityIndicator
              style={{ marginTop: 16 }}
              color={colors.primary}
              accessibilityLabel="Truhe wird geöffnet"
            />
          )}
        </View>
      </ScrollView>

      <BottomDrawer
        visible={!!buySheetLootbox}
        onClose={() => setBuySheetLootbox(null)}
      >
        <View style={styles.buySheet}>
          <Text style={styles.buyEmoji}>🗝️</Text>
          <Text style={[styles.buyTitle, { color: colors.textPrimary }]}>
            Schlüssel kaufen
          </Text>
          <Text style={[styles.buyBody, { color: colors.textSecondary }]}>
            Mecky gibt dir einen Schlüssel für {buySheetLootbox?.coins_per_key ?? 200} Münzen, mit dem
            du eine Truhe öffnen kannst.
          </Text>
          <View
            style={[
              styles.buyStatRow,
              {
                backgroundColor: isDark ? colors.surface : '#F9FAFB',
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={[styles.buyStatLabel, { color: colors.textSecondary }]}>
              Dein Guthaben
            </Text>
            <View style={styles.balanceInline}>
              <Image source={COIN_SMALL} style={styles.balanceIcon} resizeMode="contain" />
              <Text style={[styles.buyStatValue, { color: colors.textPrimary }]}>
                {coins.toLocaleString('de-DE')}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={handleBuyKey}
            disabled={
              isBuying ||
              !buySheetLootbox ||
              coins < (buySheetLootbox?.coins_per_key ?? 0)
            }
            style={({ pressed }) => [
              styles.buyCTA,
              {
                backgroundColor:
                  !buySheetLootbox || coins < buySheetLootbox.coins_per_key
                    ? colors.disabled
                    : colors.primary,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            {isBuying ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buyCTAText}>
                {!buySheetLootbox
                  ? 'Schlüssel kaufen'
                  : coins < buySheetLootbox.coins_per_key
                    ? 'Nicht genug Münzen'
                    : `Für ${buySheetLootbox.coins_per_key} Münzen kaufen`}
              </Text>
            )}
          </Pressable>
          <Pressable onPress={() => setBuySheetLootbox(null)} style={styles.buyCancel}>
            <Text style={[styles.buyCancelText, { color: colors.textSecondary }]}>
              Abbrechen
            </Text>
          </Pressable>
        </View>
      </BottomDrawer>
    </View>
  );
}

function UserRewardThumb({
  reward,
  equipped,
  isDark,
}: {
  reward?: LootboxReward;
  equipped: boolean;
  isDark: boolean;
}) {
  if (!reward) return null;
  const rarityColor = RARITY_COLOR[reward.rarity];
  return (
    <View
      style={[
        thumbStyles.wrap,
        {
          backgroundColor: isDark ? '#2d2e31' : '#FFFFFF',
          borderColor: rarityColor,
        },
      ]}
    >
      <View style={[thumbStyles.rarityBar, { backgroundColor: rarityColor }]} />
      <Image source={{ uri: reward.asset_url }} style={thumbStyles.img} resizeMode="contain" />
      {equipped && (
        <View style={thumbStyles.equippedBadge}>
          <Text style={thumbStyles.equippedText}>✓</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollRoot: { flex: 1 },
  hero: {
    width: '100%',
    height: 280,
  },
  absoluteHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: {
    marginTop: -24,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 48,
  },
  scroll: {
    paddingBottom: 0,
  },
  title: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 28,
  },
  subtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    marginTop: -6,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    marginTop: 12,
    marginBottom: 8,
  },
  balanceItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  balanceLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
  },
  balanceValue: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 18,
  },
  balanceDivider: {
    width: 1,
    height: '65%',
  },
  balanceInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  balanceIcon: {
    width: 20,
    height: 20,
  },
  balanceKeyEmoji: {
    fontSize: 18,
  },
  sectionTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 18,
    marginTop: 8,
  },
  grid: { gap: 12 },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  filler: {
    flex: 1,
  },
  rewardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 4,
  },
  buySheet: {
    gap: 12,
    paddingVertical: 8,
    paddingBottom: 24,
    alignItems: 'stretch',
  },
  buyEmoji: {
    fontSize: 40,
    alignSelf: 'center',
  },
  buyTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 20,
    textAlign: 'center',
  },
  buyBody: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  buyStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 8,
  },
  buyStatLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
  },
  buyStatValue: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
  },
  buyCTA: {
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buyCTAText: {
    color: '#fff',
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
  },
  buyCancel: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  buyCancelText: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
  },
});

const thumbStyles = StyleSheet.create({
  wrap: {
    width: 80,
    height: 80,
    borderRadius: 12,
    borderWidth: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rarityBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  img: {
    width: '80%',
    height: '80%',
  },
  equippedBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#194383',
    alignItems: 'center',
    justifyContent: 'center',
  },
  equippedText: {
    color: '#fff',
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
  },
});
