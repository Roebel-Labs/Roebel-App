import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { useAccount } from '@/context/AccountContext';
import { useEquippedRewards } from '@/hooks/useEquippedRewards';
import UserAvatarWithFrame from '@/components/UserAvatarWithFrame';
import CitizenPassportCard from '@/components/profile/CitizenPassportCard';
import { softShadow } from '@/lib/shadow';
import type { UserTier } from '@/lib/types';

interface FlippableIdentityCardProps {
  user: {
    username: string | null;
    profile_picture_url: string | null;
    bio: string | null;
    wallet_address: string;
  } | null;
  role: UserTier;
  isCitizen: boolean;
  verifiedSince?: string;
  attestedBy?: number;
  votingStreak?: number;
  isPending?: boolean;
  businessName?: string;
  verificationRequestId?: number | null;
}

type CardMode = 'tourist' | 'citizen' | 'org';

const CARD_BACK_LABELS: Record<CardMode, string> = {
  tourist: 'Tourist Card',
  citizen: 'Bürgerausweis',
  org: 'Partner Card',
};

const ORG_TYPE_LABELS: Record<string, string> = {
  restaurant: 'Restaurant',
  unternehmen: 'Unternehmen',
  verein: 'Verein',
  stadt: 'Stadt',
  fraktion: 'Fraktion',
};

export default function FlippableIdentityCard({
  user,
  role,
  isCitizen,
  verifiedSince,
  attestedBy = 0,
  votingStreak = 0,
  isPending,
  businessName,
  verificationRequestId,
}: FlippableIdentityCardProps) {
  const { colors, isDark } = useTheme();
  const { tier } = useUser();
  const { activeAccount } = useAccount();
  const equipped = useEquippedRewards();
  const isOrg = activeAccount?.account_type === 'organisation';
  const activeMode: CardMode = isOrg ? 'org' : tier === 'citizen' ? 'citizen' : 'tourist';

  const rotation = useSharedValue(0);
  const [isFlipped, setIsFlipped] = useState(false);

  const handleFlip = () => {
    // Always rotate in negative direction (right-to-left)
    const newValue = rotation.value - 180;
    rotation.value = withTiming(newValue, {
      duration: 500,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
    });
    setIsFlipped(!isFlipped);
  };

  const frontStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1200 },
      { rotateY: `${rotation.value}deg` },
    ],
    backfaceVisibility: 'hidden' as const,
  }));

  const backStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1200 },
      { rotateY: `${rotation.value + 180}deg` },
    ],
    backfaceVisibility: 'hidden' as const,
  }));

  const displayName = isOrg
    ? activeAccount?.name
    : user?.username || shortenAddress(user?.wallet_address);

  const subtitle = isOrg
    ? ORG_TYPE_LABELS[activeAccount?.sub_type || ''] || 'Organisation'
    : isCitizen
      ? 'Röbeler Bürger'
      : 'Besucher';

  const avatarUrl = isOrg
    ? (activeAccount?.avatar_url || activeAccount?.cover_url)
    : user?.profile_picture_url;
  const coverUrl = null;

  const cardBg = isDark ? colors.surface : '#FFFFFF';

  return (
    <Pressable onPress={handleFlip} style={[styles.cardContainer, softShadow(2, isDark), { backgroundColor: cardBg }]}>
      {/* FRONT */}
      <Animated.View style={[styles.card, frontStyle, { backgroundColor: cardBg }]}>
        {/* Flip hint on front */}
        <Text style={styles.flipHint}>↻</Text>

        {/* Org cover image header */}
        {isOrg && coverUrl && (
          <View style={styles.coverContainer}>
            <Image source={{ uri: coverUrl }} style={styles.coverImage} />
            <View style={styles.coverOverlay} />
          </View>
        )}

        {/* Pending status pill */}
        {isPending && (
          <View style={[styles.pendingPill, { backgroundColor: colors.warningBackground }]}>
            <Text style={[styles.pendingText, { color: colors.warning }]}>In Prüfung</Text>
          </View>
        )}

        <View style={[styles.frontContent, isOrg && coverUrl ? styles.frontContentWithCover : null]}>
          {/* Avatar with equipped frame + badge overlay */}
          <View style={styles.avatarContainer}>
            <UserAvatarWithFrame
              size={72}
              uri={avatarUrl ?? null}
              fallbackInitial={(displayName || '?').charAt(0).toUpperCase()}
              disabled={isOrg}
            />

            {/* Badge overlay */}
            {isCitizen && !isOrg && (
              <View style={styles.badgeContainer}>
                <View style={[styles.verifiedBadge, { borderColor: colors.surface, backgroundColor: colors.primary }]}>
                  <Text style={styles.verifiedCheckmark}>✓</Text>
                </View>
              </View>
            )}
            {isOrg && (
              <View style={styles.badgeContainer}>
                <View style={[styles.storeBadge, { borderColor: colors.surface }]}>
                  <Text style={styles.storeIcon}>🏪</Text>
                </View>
              </View>
            )}

            {/* Equipped badge cosmetic (secondary, bottom-left) */}
            {equipped.badge?.reward && !isOrg && (
              <View style={[styles.cosmeticBadgeContainer]}>
                <Image
                  source={{ uri: equipped.badge.reward.asset_url }}
                  style={styles.cosmeticBadgeImage}
                  resizeMode="cover"
                />
              </View>
            )}
          </View>

          {/* Name & subtitle */}
          <Text style={[styles.cardName, { color: colors.textPrimary }]} numberOfLines={1}>
            {displayName || 'Gast'}
          </Text>
          <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
            {subtitle}
          </Text>
        </View>
      </Animated.View>

      {/* BACK — passport-style card (shared with /citizen-verification page) */}
      <Animated.View style={[styles.card, styles.cardBack, backStyle]}>
        <CitizenPassportCard
          verifiedSince={verifiedSince}
          attestedBy={attestedBy}
          verificationRequestId={verificationRequestId}
          height={240}
        />
        <Text style={styles.backFlipHint}>↻</Text>
      </Animated.View>
    </Pressable>
  );
}

function shortenAddress(addr: string | undefined) {
  if (!addr) return '';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

const styles = StyleSheet.create({
  cardContainer: {
    marginHorizontal: 16,
    marginTop: 16,
    height: 240,
    borderRadius: 20,
  },
  card: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 20,
    overflow: 'hidden',
  },
  cardBack: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },

  // --- Cover image (org) ---
  coverContainer: {
    height: 80,
    width: '100%',
    overflow: 'hidden',
  },
  coverImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  coverOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },

  // --- Pending pill ---
  pendingPill: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    zIndex: 10,
  },
  pendingText: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
  },

  // --- Front content ---
  frontContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 4,
  },
  frontContentWithCover: {
    marginTop: -36,
  },

  // --- Avatar ---
  avatarContainer: {
    position: 'relative',
    marginBottom: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cosmeticBadgeContainer: {
    position: 'absolute',
    top: -4,
    left: -4,
    width: 28,
    height: 28,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  cosmeticBadgeImage: {
    width: '100%',
    height: '100%',
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  avatarPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 28,
    fontFamily: 'Inter-SemiBold',
  },

  // --- Verified badge (citizen) ---
  badgeContainer: {
    position: 'absolute',
    bottom: -2,
    right: -2,
  },
  verifiedBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  verifiedCheckmark: {
    color: '#ffffff',
    fontSize: 12,
    fontFamily: 'Inter-Bold',
  },

  // --- Store badge (org) ---
  storeBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#194383',
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  storeIcon: {
    fontSize: 12,
  },

  // --- Name & subtitle ---
  cardName: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    textAlign: 'center',
  },
  cardSubtitle: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },

  // --- Front flip hint ---
  flipHint: {
    position: 'absolute',
    top: 14,
    right: 16,
    fontSize: 14,
    color: 'rgba(0,0,0,0.25)',
    zIndex: 10,
  },

  // --- Back side flip hint (passport visuals live in CitizenPassportCard) ---
  backFlipHint: {
    position: 'absolute',
    top: 14,
    right: 16,
    fontSize: 14,
    color: 'rgba(255,255,255,0.35)',
    zIndex: 10,
  },
});
