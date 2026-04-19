import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
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
import { useUser } from '@/context/UserContext';
import { useSnackbar } from '@/context/SnackbarContext';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import CoinBalanceBadge from '@/components/rewards/CoinBalanceBadge';
import { fetchLootboxes, type Lootbox } from '@/lib/supabase-rewards';

const CHEST = require('../../../assets/illustration/gamification/lootbox.png');
const COIN_SMALL = require('../../../assets/illustration/gamification/single.png');

export default function LootboxDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, isDark } = useTheme();
  const { isConnected } = useUser();
  const { showSnackbar } = useSnackbar();
  const { lootboxes, coins, keyCount, buyKey, openChest } = useRewards();

  const [directLootbox, setDirectLootbox] = useState<Lootbox | null>(null);
  const [isBuying, setIsBuying] = useState(false);
  const [isOpening, setIsOpening] = useState(false);

  const shake = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  // Primary: read the lootbox from context. Fallback: direct fetch (deep link).
  const contextLootbox = lootboxes.find((lb) => lb.id === id) || null;
  const lootbox = contextLootbox || directLootbox;

  useEffect(() => {
    if (!contextLootbox && id) {
      fetchLootboxes().then((all) => {
        const found = all.find((lb) => lb.id === id);
        if (found) setDirectLootbox(found);
      });
    }
  }, [id, contextLootbox]);

  const canAfford = lootbox ? coins >= lootbox.coins_per_key : false;
  const hasKey = keyCount > 0;

  const handleBuyKey = async () => {
    if (!lootbox || !isConnected) return;
    setIsBuying(true);
    try {
      const res = await buyKey(lootbox.id);
      if (res.success) {
        if (Platform.OS !== 'web') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        }
        showSnackbar({
          message: `Schlüssel gekauft (−${lootbox.coins_per_key} Münzen)`,
        });
      } else if (res.error === 'insufficient_balance') {
        showSnackbar({ message: 'Nicht genug Münzen' });
      } else {
        showSnackbar({ message: 'Fehler beim Kauf' });
      }
    } finally {
      setIsBuying(false);
    }
  };

  const handleOpen = () => {
    if (!lootbox || isOpening) return;
    setIsOpening(true);

    // Stage 1: shake the chest 3x
    const shakeAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(shake, {
          toValue: 1,
          duration: 70,
          useNativeDriver: true,
          easing: Easing.linear,
        }),
        Animated.timing(shake, {
          toValue: -1,
          duration: 70,
          useNativeDriver: true,
          easing: Easing.linear,
        }),
        Animated.timing(shake, {
          toValue: 0,
          duration: 70,
          useNativeDriver: true,
          easing: Easing.linear,
        }),
      ]),
      { iterations: 3 }
    );

    shakeAnim.start(async () => {
      // Fire the RPC while the burst animation plays.
      const rpcPromise = openChest(lootbox.id);

      // Stage 2: burst — scale up + fade out
      Animated.parallel([
        Animated.timing(scale, {
          toValue: 1.3,
          duration: 380,
          useNativeDriver: true,
          easing: Easing.out(Easing.quad),
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 380,
          useNativeDriver: true,
        }),
      ]).start();

      const res = await rpcPromise;
      setIsOpening(false);

      if (res.success) {
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
            () => {}
          );
        }
        router.replace({
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
      } else {
        // Reset the animation so the user can try again.
        scale.setValue(1);
        opacity.setValue(1);
        shake.setValue(0);
        showSnackbar({
          message:
            res.error === 'no_key'
              ? 'Kein Schlüssel vorhanden'
              : 'Öffnen fehlgeschlagen',
        });
      }
    });
  };

  const shakeTranslate = shake.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [-10, 0, 10],
  });

  if (!lootbox) {
    return (
      <SafeAreaView
        style={[styles.safe, { backgroundColor: colors.background }]}
        edges={['top']}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
          </Pressable>
        </View>
        <View style={styles.loadingBlock}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
          accessibilityLabel="Zurück"
        >
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <CoinBalanceBadge />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.artArea}>
          <Animated.View
            style={[
              styles.chestWrap,
              {
                transform: [{ translateX: shakeTranslate }, { scale }],
                opacity,
              },
            ]}
          >
            <Image
              source={
                lootbox.image_url && !lootbox.image_url.includes('placehold.co')
                  ? { uri: lootbox.image_url }
                  : CHEST
              }
              style={styles.chest}
              resizeMode="contain"
            />
          </Animated.View>
        </View>

        <Text style={[styles.title, { color: colors.textPrimary }]}>{lootbox.name}</Text>
        {!!lootbox.description && (
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            {lootbox.description}
          </Text>
        )}

        <View
          style={[
            styles.costCard,
            {
              backgroundColor: isDark ? colors.surface : '#FFFBEA',
              borderColor: '#E9B949',
            },
          ]}
        >
          <Image source={COIN_SMALL} style={styles.costIcon} resizeMode="contain" />
          <View style={{ flex: 1 }}>
            <Text style={[styles.costLabel, { color: colors.textSecondary }]}>
              Kostet
            </Text>
            <Text style={[styles.costValue, { color: colors.textPrimary }]}>
              {lootbox.coins_per_key} Münzen pro Schlüssel
            </Text>
          </View>
          {hasKey && (
            <View style={[styles.keyPill, { backgroundColor: colors.primary }]}>
              <Text style={styles.keyPillText}>🗝️ {keyCount}</Text>
            </View>
          )}
        </View>

        {hasKey ? (
          <Pressable
            onPress={handleOpen}
            disabled={isOpening}
            style={({ pressed }) => [
              styles.primaryCTA,
              {
                backgroundColor: colors.primary,
                opacity: pressed || isOpening ? 0.85 : 1,
              },
            ]}
          >
            {isOpening ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryCTAText}>Truhe mit Schlüssel öffnen</Text>
            )}
          </Pressable>
        ) : (
          <Pressable
            onPress={handleBuyKey}
            disabled={isBuying || !canAfford || !isConnected}
            style={({ pressed }) => [
              styles.primaryCTA,
              {
                backgroundColor: canAfford && isConnected ? colors.primary : colors.disabled,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            {isBuying ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryCTAText}>
                {!isConnected
                  ? 'Anmelden zum Kaufen'
                  : canAfford
                    ? `Schlüssel kaufen für ${lootbox.coins_per_key} Münzen`
                    : `Noch ${lootbox.coins_per_key - coins} Münzen nötig`}
              </Text>
            )}
          </Pressable>
        )}

        <Text style={[styles.footerHint, { color: colors.textTertiary }]}>
          Mecky gibt dir einen Schlüssel, mit dem du die Truhe einmal öffnen kannst.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    paddingBottom: 48,
    gap: 16,
  },
  loadingBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  artArea: {
    width: '100%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chestWrap: {
    width: '75%',
    height: '75%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chest: {
    width: '100%',
    height: '100%',
  },
  title: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 28,
    textAlign: 'center',
  },
  description: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  costCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  costIcon: { width: 28, height: 28 },
  costLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  costValue: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
    marginTop: 2,
  },
  keyPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  keyPillText: {
    color: '#fff',
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
  },
  primaryCTA: {
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryCTAText: {
    color: '#fff',
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
  },
  footerHint: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
});
