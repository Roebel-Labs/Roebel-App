import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import QRCode from 'react-native-qrcode-svg';
import Svg, { Path, Rect, Line, Defs, LinearGradient, Stop } from 'react-native-svg';
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
  verificationRequestId,
}: FlippableIdentityCardProps) {
  const { colors, isDark } = useTheme();
  const { tier } = useUser();
  const { activeAccount } = useAccount();
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

  const cardShadow = Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.2 : 0.08,
      shadowRadius: 16,
    },
    android: {
      elevation: 6,
    },
  });

  return (
    <Pressable onPress={handleFlip} style={styles.cardContainer}>
      {/* FRONT */}
      <Animated.View style={[styles.card, frontStyle, cardShadow, { backgroundColor: cardBg }]}>
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

      {/* BACK — Passport style */}
      <Animated.View style={[styles.card, styles.cardBack, backStyle, cardShadow]}>
        {/* Gradient background */}
        <View style={StyleSheet.absoluteFill}>
          <Svg width="100%" height="100%" viewBox="0 0 400 200" preserveAspectRatio="none">
            <Defs>
              <LinearGradient id="passportGrad" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#194383" />
                <Stop offset="0.4" stopColor="#0f2b55" />
                <Stop offset="0.7" stopColor="#194383" />
                <Stop offset="1" stopColor="#2563eb" />
              </LinearGradient>
            </Defs>
            <Rect width="400" height="200" fill="url(#passportGrad)" />
            {/* Topographic wave pattern */}
            <Path d="M0,35 Q100,15 200,45 T400,25" fill="none" stroke="white" strokeWidth="1.2" opacity="0.07" />
            <Path d="M0,60 Q80,40 160,70 T400,50" fill="none" stroke="white" strokeWidth="1.2" opacity="0.07" />
            <Path d="M0,85 Q120,65 240,95 T400,75" fill="none" stroke="white" strokeWidth="1.2" opacity="0.07" />
            <Path d="M0,110 Q90,90 180,120 T400,100" fill="none" stroke="white" strokeWidth="1.2" opacity="0.07" />
            <Path d="M0,135 Q110,115 220,145 T400,125" fill="none" stroke="white" strokeWidth="1.2" opacity="0.07" />
            <Path d="M0,160 Q100,140 200,170 T400,150" fill="none" stroke="white" strokeWidth="1.2" opacity="0.07" />
            <Path d="M0,185 Q80,165 160,195 T400,175" fill="none" stroke="white" strokeWidth="1.2" opacity="0.07" />
            {/* Shield watermark */}
            <Rect x="260" y="50" width="50" height="70" rx="3" fill="none" stroke="white" strokeWidth="0.8" opacity="0.08" />
            <Line x1="285" y1="50" x2="285" y2="120" stroke="white" strokeWidth="0.8" opacity="0.08" />
            <Line x1="260" y1="85" x2="310" y2="85" stroke="white" strokeWidth="0.8" opacity="0.08" />
          </Svg>
        </View>

        {/* Flip hint */}
        <Text style={styles.backFlipHint}>↻</Text>

        {/* Content */}
        <View style={styles.passportContent}>
          {/* Header */}
          <View>
            <Text style={styles.passportTitle}>Bürgerausweis</Text>
            <Text style={styles.passportSubtitle}>STADT RÖBEL/MÜRITZ</Text>
          </View>

          {/* Bottom row */}
          <View style={styles.passportBottom}>
            <View style={styles.passportInfo}>
              {verifiedSince ? (
                <>
                  <Text style={styles.passportLabel}>VERIFIZIERT SEIT</Text>
                  <Text style={styles.passportValue}>{verifiedSince}</Text>
                </>
              ) : (
                <>
                  <Text style={styles.passportLabel}>STATUS</Text>
                  <Text style={styles.passportValue}>Nicht verifiziert</Text>
                </>
              )}
              {attestedBy > 0 && (
                <>
                  <Text style={[styles.passportLabel, { marginTop: 10 }]}>ATTESTIERT DURCH</Text>
                  <Text style={styles.passportValue}>{attestedBy} Bürger</Text>
                </>
              )}
            </View>

            {/* QR Code */}
            <View style={styles.passportQR}>
              {verificationRequestId ? (
                <QRCode
                  value={`roebel://verification/request/${verificationRequestId}?type=citizen`}
                  size={76}
                  backgroundColor="white"
                  color="#194383"
                />
              ) : (
                <Text style={styles.passportQRPlaceholder}>QR</Text>
              )}
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

  // --- Front flip hint ---
  flipHint: {
    position: 'absolute',
    top: 14,
    right: 16,
    fontSize: 14,
    color: 'rgba(0,0,0,0.25)',
    zIndex: 10,
  },

  // --- Back side (passport) ---
  backFlipHint: {
    position: 'absolute',
    top: 14,
    right: 16,
    fontSize: 14,
    color: 'rgba(255,255,255,0.35)',
    zIndex: 10,
  },
  passportContent: {
    flex: 1,
    padding: 20,
    justifyContent: 'space-between',
  },
  passportTitle: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: 0.5,
  },
  passportSubtitle: {
    fontSize: 9,
    fontFamily: 'Inter-Medium',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 1.5,
    marginTop: 3,
  },
  passportBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  passportInfo: {
    flex: 1,
  },
  passportLabel: {
    fontSize: 9,
    fontFamily: 'Inter-Medium',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.5,
  },
  passportValue: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
    marginTop: 2,
  },
  passportQR: {
    width: 84,
    height: 84,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  passportQRPlaceholder: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#194383',
  },
});
