import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { useAccount } from '@/context/AccountContext';
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
}

type CardMode = 'tourist' | 'citizen' | 'org';

const CARD_BACK_LABELS: Record<CardMode, string> = {
  tourist: 'Tourist Card',
  citizen: 'Bürgerausweis',
  org: 'Partner Card',
};

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
  attestedBy = 0,
  votingStreak = 0,
  isPending,
  businessName,
}: FlippableIdentityCardProps) {
  const { colors, isDark } = useTheme();
  const { tier } = useUser();
  const { activeAccount } = useAccount();
  const isOrg = activeAccount?.account_type === 'organisation';
  const activeMode: CardMode = isOrg ? 'org' : tier === 'citizen' ? 'citizen' : 'tourist';

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
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: isDark ? 0.4 : 0.12,
        shadowRadius: 12,
      },
      android: {
        elevation: 4,
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
        <Text style={styles.flipHint}>↻</Text>

        <View style={styles.backContent}>
          <Text style={[styles.backTitle, { color: colors.textPrimary }]}>{CARD_BACK_LABELS[activeMode]}</Text>

          <View style={styles.backBody}>
            <View style={styles.backInfoColumn}>
              {verifiedSince && (
                <>
                  <Text style={[styles.backLabel, { color: colors.textTertiary }]}>Verifiziert seit</Text>
                  <Text style={[styles.backValue, { color: colors.textPrimary }]}>{verifiedSince}</Text>
                </>
              )}

              {attestedBy > 0 && (
                <>
                  <Text style={[styles.backLabel, { color: colors.textTertiary, marginTop: 8 }]}>Attestiert durch</Text>
                  <Text style={[styles.backValue, { color: colors.textPrimary }]}>{attestedBy} Bürger</Text>
                </>
              )}

              {votingStreak > 0 && (
                <>
                  <Text style={[styles.backLabel, { color: colors.textTertiary, marginTop: 8 }]}>Voting Streak</Text>
                  <Text style={[styles.backValue, { color: colors.textPrimary }]}>{votingStreak} Wochen 🔥</Text>
                </>
              )}

              {businessName && (
                <>
                  <Text style={[styles.backLabel, { color: colors.textTertiary, marginTop: 8 }]}>Organisation</Text>
                  <Text style={[styles.backValue, { color: colors.textPrimary }]}>{businessName}</Text>
                </>
              )}

              {!verifiedSince && !businessName && (
                <>
                  <Text style={[styles.backLabel, { color: colors.textTertiary }]}>Status</Text>
                  <Text style={[styles.backValue, { color: colors.textPrimary }]}>Nicht verifiziert</Text>
                  <Text style={[styles.backLabel, { color: colors.textTertiary, marginTop: 12 }]}>
                    Werde Bürger, um alle{'\n'}Funktionen freizuschalten
                  </Text>
                </>
              )}
            </View>

            <View style={[styles.qrPlaceholder, { backgroundColor: colors.surfaceSecondary }]}>
              <Text style={[styles.qrText, { color: colors.textTertiary }]}>QR</Text>
            </View>
          </View>
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
    height: 200,
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

  // --- Back side ---
  flipHint: {
    position: 'absolute',
    top: 14,
    right: 16,
    fontSize: 14,
    color: 'rgba(0,0,0,0.25)',
  },
  backContent: {
    flex: 1,
    padding: 20,
    justifyContent: 'space-between',
  },
  backTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },
  backBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  backInfoColumn: {
    flex: 1,
  },
  backLabel: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
  },
  backValue: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    marginTop: 1,
  },
  qrPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
});
