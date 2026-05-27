import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import SquareLockIcon from '@/assets/icons/square-lock-02.svg';
import type { Lootbox } from '@/lib/supabase-rewards';

interface LootboxCardProps {
  lootbox: Lootbox;
  canAfford: boolean;
  hasKey: boolean;
  onPress: () => void;
}

const CHEST = require('../../assets/illustration/gamification/lootbox.png');
const COIN = require('../../assets/illustration/gamification/single.png');

/**
 * Three visual states:
 *  - hasKey       → fully colored, keyCount pill shown
 *  - canAfford    → fully colored, coin cost shown
 *  - !canAfford   → greyed out with lock overlay
 *
 * The local chest asset is always preferred when no remote image_url is
 * provided by the admin.
 */
export default function LootboxCard({
  lootbox,
  canAfford,
  hasKey,
  onPress,
}: LootboxCardProps) {
  const { colors, isDark } = useTheme();
  const isLocked = !hasKey && !canAfford;
  const imageSource =
    lootbox.image_url && !lootbox.image_url.includes('placehold.co')
      ? { uri: lootbox.image_url }
      : CHEST;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: isDark ? colors.surface : '#FFFFFF',
          borderColor: colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled: isLocked }}
    >
      <View style={styles.imageWrap}>
        <Image
          source={imageSource}
          style={[styles.image, isLocked && styles.imageLocked]}
          resizeMode="contain"
        />
        {isLocked && (
          <View style={styles.lockedOverlay}>
            <View
              style={[
                styles.lockedBubble,
                { backgroundColor: isDark ? colors.surface : 'rgba(255,255,255,0.9)' },
              ]}
            >
              <SquareLockIcon width={20} height={20} color={colors.textSecondary} />
            </View>
          </View>
        )}
        {hasKey && (
          <View style={[styles.keyBadge, { backgroundColor: colors.primary }]}>
            <Text style={styles.keyBadgeText}>Bereit</Text>
          </View>
        )}
      </View>
      <Text
        style={[
          styles.name,
          {
            color: isLocked ? colors.textTertiary : colors.textPrimary,
          },
        ]}
        numberOfLines={1}
      >
        {lootbox.name}
      </Text>
      <View style={styles.costRow}>
        {hasKey ? (
          <Text style={[styles.cost, { color: colors.primary }]}>Öffnen</Text>
        ) : (
          <>
            <Image source={COIN} style={styles.coinImg} resizeMode="contain" />
            <Text
              style={[
                styles.cost,
                {
                  color: isLocked ? colors.textTertiary : colors.textPrimary,
                },
              ]}
            >
              {lootbox.coins_per_key}
            </Text>
          </>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 8,
    alignItems: 'center',
    gap: 6,
  },
  imageWrap: {
    width: '100%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageLocked: {
    opacity: 0.45,
  },
  lockedOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  keyBadgeText: {
    color: '#fff',
    fontFamily: 'Inter-SemiBold',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  name: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
  },
  costRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 16,
  },
  coinImg: {
    width: 14,
    height: 14,
  },
  cost: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
  },
});
