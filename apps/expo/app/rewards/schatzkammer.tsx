import React, { useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';

import { useTheme } from '@/context/ThemeContext';
import { useRewards } from '@/context/RewardsContext';
import { useUser } from '@/context/UserContext';
import { useSnackbar } from '@/context/SnackbarContext';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import LootboxCard from '@/components/rewards/LootboxCard';
import CoinBalanceBadge from '@/components/rewards/CoinBalanceBadge';
import type { Lootbox, LootboxReward, LootboxRewardRarity } from '@/lib/supabase-rewards';

const HERO = require('../../assets/illustration/gamification/treasury_chamber.png');

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
  const { coins, keyCount, lootboxes, userRewards, refresh, isLoading } = useRewards();

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const handleChestPress = useCallback(
    (lootbox: Lootbox) => {
      if (!isConnected) {
        showSnackbar({ message: 'Bitte zuerst anmelden' });
        return;
      }
      router.push({
        pathname: '/rewards/lootbox/[id]',
        params: { id: lootbox.id },
      } as any);
    },
    [isConnected, router, showSnackbar]
  );

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
          <CoinBalanceBadge />
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
        </View>
      </ScrollView>
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
  sectionTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 18,
    marginTop: 16,
    marginBottom: 10,
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
