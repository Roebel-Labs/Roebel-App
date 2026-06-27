import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { useTheme } from '@/context/ThemeContext';
import { useRewards } from '@/context/RewardsContext';
import { useUser } from '@/context/UserContext';
import { useSnackbar } from '@/context/SnackbarContext';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import BottomDrawer from '@/components/BottomDrawer';
import LootboxCard from '@/components/rewards/LootboxCard';
import OpenedLootboxCard from '@/components/rewards/OpenedLootboxCard';
import { useRoebelTaler } from '@/hooks/useRoebelTaler';
import { buyLootboxKeyWithMuenzen } from '@/lib/lootbox-muenzen';
import type { Lootbox, UserLootboxReward } from '@/lib/supabase-rewards';

const HERO = require('../../assets/illustration/gamification/treasury_chamber.png');
const COIN_SMALL = require('../../assets/illustration/gamification/single.png');
const KEY_IMG = require('../../assets/illustration/gamification/key.png');

/** Lootbox key price in whole Röbel Münzen (from muenzen_price_atto; default 5). */
const priceRcrc = (lb: Lootbox | null) => {
  const atto = (lb as any)?.muenzen_price_atto;
  return atto != null ? Math.round(Number(atto) / 1e18) : 5;
};

export default function SchatzkammerScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { isConnected } = useUser();
  const { showSnackbar } = useSnackbar();
  const {
    lootboxes,
    userRewards,
    keyCountFor,
    refresh,
    isLoading,
  } = useRewards();
  // Lootbox keys are now bought with real Röbel Münzen (RCRC), not off-chain points.
  const { talerBalance, account: gnosisAccount } = useRoebelTaler();

  const { buy } = useLocalSearchParams<{ buy?: string }>();
  const [buySheetLootbox, setBuySheetLootbox] = useState<Lootbox | null>(null);
  const [isBuying, setIsBuying] = useState(false);
  const autoOpenedFor = useRef<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  // If the lootbox detail page bounced back with ?buy=<id>, auto-open the
  // buy sheet for that chest. Guarded by a ref so we don't loop.
  useEffect(() => {
    if (!buy || !lootboxes.length) return;
    if (autoOpenedFor.current === buy) return;
    const target = lootboxes.find((lb) => lb.id === buy);
    if (target) {
      autoOpenedFor.current = buy;
      setBuySheetLootbox(target);
      // Drop the query param so back-nav doesn't reopen it.
      router.setParams({ buy: undefined } as any);
    }
  }, [buy, lootboxes, router]);

  const handleChestPress = useCallback(
    (lootbox: Lootbox) => {
      if (!isConnected) {
        showSnackbar({ message: 'Bitte zuerst anmelden' });
        return;
      }
      // Per-chest key: already bought for THIS specific Truhe → go to
      // the detail page to open. Otherwise, if affordable, open the buy
      // sheet for this chest.
      if (keyCountFor(lootbox.id) > 0) {
        router.push({
          pathname: '/rewards/lootbox/[id]',
          params: { id: lootbox.id },
        } as any);
        return;
      }
      const price = priceRcrc(lootbox);
      if (talerBalance >= price) {
        setBuySheetLootbox(lootbox);
      } else {
        showSnackbar({
          message: `Noch ${Math.ceil(price - talerBalance)} Röbel Münzen nötig`,
        });
      }
    },
    [talerBalance, isConnected, keyCountFor, router, showSnackbar]
  );

  const handleBuyKey = useCallback(async () => {
    if (!buySheetLootbox) return;
    if (!gnosisAccount) {
      showSnackbar({ message: 'Wallet noch nicht bereit' });
      return;
    }
    const target = buySheetLootbox;
    setIsBuying(true);
    try {
      const res = await buyLootboxKeyWithMuenzen(gnosisAccount, target.id);
      if (res.status === 'settled' || res.status === 'already_settled') {
        if (Platform.OS !== 'web') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        }
        setBuySheetLootbox(null);
        await refresh();
        // Key granted → go straight to the detail page so the user can open it
        // (no success snackbar).
        router.push({
          pathname: '/rewards/lootbox/[id]',
          params: { id: target.id },
        } as any);
      } else if (res.status === 'insufficient') {
        showSnackbar({ message: 'Nicht genug Röbel Münzen' });
      } else {
        showSnackbar({ message: res.reason || 'Fehler beim Kauf' });
      }
    } finally {
      setIsBuying(false);
    }
  }, [gnosisAccount, buySheetLootbox, router, showSnackbar, refresh]);

  const handleOpenedPress = useCallback(
    (ur: UserLootboxReward) => {
      const reward = ur.reward;
      if (!reward) return;
      router.push({
        pathname: '/rewards/reward/[id]',
        params: {
          id: ur.id,
          name: reward.name,
          description: reward.description || '',
          asset_url: reward.asset_url,
          rarity: reward.rarity,
          type: reward.type,
          coin_value: reward.coin_value != null ? String(reward.coin_value) : '',
        },
      } as any);
    },
    [router]
  );

  const chestsInRows = useMemo(() => {
    const rows: Lootbox[][] = [];
    for (let i = 0; i < lootboxes.length; i += 3) {
      rows.push(lootboxes.slice(i, i + 3));
    }
    return rows;
  }, [lootboxes]);

  const openedInRows = useMemo(() => {
    const rows: UserLootboxReward[][] = [];
    for (let i = 0; i < userRewards.length; i += 3) {
      rows.push(userRewards.slice(i, i + 3));
    }
    return rows;
  }, [userRewards]);

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
          <Pressable
            onPress={() => router.push('/rewards' as any)}
            style={styles.rcrcBadge}
            accessibilityRole="button"
            accessibilityLabel={`${Math.round(talerBalance)} Röbel Münzen`}
          >
            <Image source={COIN_SMALL} style={styles.balanceIcon} resizeMode="contain" />
            <Text style={styles.rcrcBadgeText}>{Math.round(talerBalance).toLocaleString('de-DE')}</Text>
          </Pressable>
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
                      hasKey={keyCountFor(lootbox.id) > 0}
                      canAfford={talerBalance >= priceRcrc(lootbox)}
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
                Meine geöffneten Truhen
              </Text>
              <View style={styles.grid}>
                {openedInRows.map((row, i) => (
                  <View key={`opened-row-${i}`} style={styles.row}>
                    {row.map((ur) => (
                      <OpenedLootboxCard
                        key={ur.id}
                        userReward={ur}
                        onPress={() => handleOpenedPress(ur)}
                      />
                    ))}
                    {Array.from({ length: 3 - row.length }).map((_, idx) => (
                      <View key={`opened-fill-${i}-${idx}`} style={styles.filler} />
                    ))}
                  </View>
                ))}
              </View>
            </>
          )}
        </View>
      </ScrollView>

      <BottomDrawer
        visible={!!buySheetLootbox}
        onClose={() => setBuySheetLootbox(null)}
      >
        <View style={styles.buySheet}>
          <Image source={KEY_IMG} style={styles.buyKeyImage} resizeMode="contain" />
          <Text style={[styles.buyTitle, { color: colors.textPrimary }]}>
            Schlüssel kaufen
          </Text>
          <Text style={[styles.buyBody, { color: colors.textSecondary }]}>
            Mecky gibt dir einen Schlüssel für {priceRcrc(buySheetLootbox)}{' '}
            Röbel Münzen. Damit kannst du die Truhe einmal öffnen.
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
                {Math.round(talerBalance).toLocaleString('de-DE')}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={handleBuyKey}
            disabled={isBuying || !buySheetLootbox || talerBalance < priceRcrc(buySheetLootbox)}
            style={({ pressed }) => [
              styles.buyCTA,
              {
                backgroundColor:
                  !buySheetLootbox || talerBalance < priceRcrc(buySheetLootbox)
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
                  : talerBalance < priceRcrc(buySheetLootbox)
                    ? 'Nicht genug Röbel Münzen'
                    : `Für ${priceRcrc(buySheetLootbox)} Röbel Münzen kaufen`}
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
  rcrcBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 999,
    paddingHorizontal: 12,
    height: 36,
  },
  rcrcBadgeText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
    color: '#00498B',
  },
  balanceInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  balanceIcon: {
    width: 18,
    height: 18,
  },
  buySheet: {
    gap: 12,
    paddingVertical: 8,
    paddingBottom: 24,
    alignItems: 'stretch',
  },
  buyKeyImage: {
    width: 72,
    height: 72,
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
