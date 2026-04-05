import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { openBrowserAsync } from 'expo-web-browser';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { useAccount } from '@/context/AccountContext';
import type { UserTier } from '@/lib/types';
import ArrowLeftIcon from '@/assets/icons/arrow-left.svg';

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
}

const ORG_TYPE_LABELS: Record<string, string> = {
  unternehmen: 'Unternehmen',
  verein: 'Verein',
  partei: 'Partei',
  fraktion: 'Fraktion',
};

export default function FlippableIdentityCard({
  user,
  role,
  isCitizen,
  verifiedSince,
  isPending,
}: FlippableIdentityCardProps) {
  const { colors, isDark } = useTheme();
  const { tier } = useUser();
  const { activeAccount } = useAccount();
  const isOrg = activeAccount?.account_type !== 'personal' && activeAccount !== null;

  const rotation = useSharedValue(0);
  const [isFlipped, setIsFlipped] = useState(false);

  const handleFlip = () => {
    const newValue = isFlipped ? 0 : 180;
    rotation.value = withTiming(newValue, {
      duration: 500,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
    });
    setIsFlipped(!isFlipped);
  };

  const frontStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1200 },
      { rotateY: `${interpolate(rotation.value, [0, 180], [0, 180])}deg` },
    ],
    backfaceVisibility: 'hidden' as const,
  }));

  const backStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1200 },
      { rotateY: `${interpolate(rotation.value, [0, 180], [180, 360])}deg` },
    ],
    backfaceVisibility: 'hidden' as const,
  }));

  const displayName = isOrg
    ? activeAccount?.name
    : user?.username || shortenAddress(user?.wallet_address);

  const subtitle = isOrg
    ? ORG_TYPE_LABELS[activeAccount?.account_type || ''] || 'Organisation'
    : isCitizen
      ? 'Röbeler Bürger'
      : 'Besucher';

  const avatarUrl = isOrg ? activeAccount?.avatar_url : user?.profile_picture_url;
  const coverUrl = isOrg ? activeAccount?.cover_url : null;

  const cardShadow = {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: isDark ? 0.3 : 0.08,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
    }),
  };

  return (
    <Pressable onPress={handleFlip} style={styles.cardContainer}>
      {/* FRONT */}
      <Animated.View style={[styles.card, frontStyle, { backgroundColor: colors.surface }, cardShadow]}>
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
          {/* Avatar with badge */}
          <View style={styles.avatarContainer}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primaryLight }]}>
                <Text style={[styles.avatarText, { color: colors.primary }]}>
                  {(displayName || '?').charAt(0).toUpperCase()}
                </Text>
              </View>
            )}

            {/* Badge overlay */}
            {isCitizen && !isOrg && (
              <View style={styles.badgeContainer}>
                <View style={[styles.verifiedBadge, { borderColor: colors.surface }]}>
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

      {/* BACK */}
      <Animated.View style={[styles.card, styles.cardBack, backStyle, { backgroundColor: colors.surface }, cardShadow]}>
        {/* Back button */}
        <Pressable onPress={handleFlip} style={styles.backButton} hitSlop={12}>
          <ArrowLeftIcon width={20} height={20} color={colors.textPrimary} />
        </Pressable>

        <View style={styles.backContent}>
          <Text style={[styles.backHeading, { color: colors.textPrimary }]}>
            {isOrg ? 'Über uns' : 'Bürgerverifizierung'}
          </Text>

          <Text style={[styles.backBody, { color: colors.textSecondary }]}>
            {isOrg
              ? 'Lokale Organisationen in Röbel können sich als verifizierte Partner registrieren und ihre Angebote direkt in der App verwalten.'
              : 'Bürger von Röbel werden durch bestehende Mitbürger verifiziert. Die Verifizierung basiert auf Soulbound NFTs auf der Base L2 Blockchain — nicht übertragbar und einzigartig pro Person.\n\nUnser Ziel: Transparente, digitale Bürgerbeteiligung für Röbel/Müritz — von Abstimmungen bis Vereinsleben.'}
          </Text>

          <Pressable onPress={() => openBrowserAsync('https://www.roebel.app')}>
            <Text style={[styles.backLink, { color: colors.primary }]}>roebel.app →</Text>
          </Pressable>
        </View>
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
    height: 100,
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
    paddingVertical: 20,
    gap: 6,
  },
  frontContentWithCover: {
    marginTop: -40,
  },

  // --- Avatar ---
  avatarContainer: {
    position: 'relative',
    marginBottom: 4,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 32,
    fontFamily: 'Inter-SemiBold',
  },

  // --- Verified badge (citizen) ---
  badgeContainer: {
    position: 'absolute',
    bottom: -2,
    right: -2,
  },
  verifiedBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#E91E63',
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  verifiedCheckmark: {
    color: '#ffffff',
    fontSize: 13,
    fontFamily: 'Inter-Bold',
  },

  // --- Store badge (org) ---
  storeBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#194383',
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  storeIcon: {
    fontSize: 13,
  },

  // --- Name & subtitle ---
  cardName: {
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
    textAlign: 'center',
  },
  cardSubtitle: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },

  // --- Back side ---
  backButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backContent: {
    flex: 1,
    padding: 24,
    paddingTop: 56,
    justifyContent: 'flex-start',
    gap: 12,
  },
  backHeading: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
  },
  backBody: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
  },
  backLink: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    marginTop: 4,
  },
});
