import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { useTheme } from '@/context/ThemeContext';
import { useAppMode } from '@/context/AppModeContext';
import type { AppMode, UserRole } from '@/lib/types';

interface FlippableIdentityCardProps {
  user: {
    username: string | null;
    profile_picture_url: string | null;
    bio: string | null;
    wallet_address: string;
  } | null;
  role: UserRole;
  roleLabel: string;
  isCitizen: boolean;
  pointsBalance?: number;
  verifiedSince?: string;
  attestedBy?: number;
  votingStreak?: number;
  badges?: string[];
  businessName?: string;
}

const ROLE_EMOJI: Record<AppMode, string> = {
  tourist: '🗺️',
  citizen: '🏛️',
  org: '🏢',
};

const MODE_LABELS: Record<AppMode, string> = {
  tourist: 'Besucher',
  citizen: 'Bürger',
  org: 'Partner',
};

const CARD_BACK_LABELS: Record<AppMode, string> = {
  tourist: 'Tourist Card',
  citizen: 'Bürgerausweis',
  org: 'Partner Card',
};

export default function FlippableIdentityCard({
  user,
  role,
  roleLabel,
  isCitizen,
  pointsBalance = 0,
  verifiedSince,
  attestedBy = 0,
  votingStreak = 0,
  badges = [],
  businessName,
}: FlippableIdentityCardProps) {
  const { colors } = useTheme();
  const { activeMode } = useAppMode();
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

  const frontStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { perspective: 1200 },
        { rotateY: `${interpolate(rotation.value, [0, 180], [0, 180])}deg` },
      ],
      backfaceVisibility: 'hidden',
    };
  });

  const backStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { perspective: 1200 },
        { rotateY: `${interpolate(rotation.value, [0, 180], [180, 360])}deg` },
      ],
      backfaceVisibility: 'hidden',
    };
  });

  const displayName = user?.username || shortenAddress(user?.wallet_address);
  const modeEmoji = ROLE_EMOJI[activeMode];
  const modeLabel = MODE_LABELS[activeMode];

  // Gradient colors per mode
  const gradientColors = {
    tourist: ['#6b7280', '#4b5563'],
    citizen: ['#194383', '#2563eb'],
    org: ['#1e1e2e', '#374151'],
  };

  const backGradientColors = {
    tourist: ['#f97316', '#ef4444'],
    citizen: ['#dc2626', '#f97316'],
    org: ['#7c3aed', '#2563eb'],
  };

  return (
    <Pressable onPress={handleFlip} style={styles.cardContainer}>
      {/* FRONT */}
      <Animated.View style={[styles.card, frontStyle, { backgroundColor: gradientColors[activeMode][0] }]}>
        <Text style={styles.flipHint}>↻</Text>

        <View style={styles.frontContent}>
          <View style={styles.frontHeader}>
            {user?.profile_picture_url ? (
              <Image source={{ uri: user.profile_picture_url }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                <Text style={styles.avatarText}>
                  {displayName?.charAt(0).toUpperCase() || '?'}
                </Text>
              </View>
            )}
            <View style={styles.frontHeaderText}>
              <Text style={styles.cardName} numberOfLines={1}>{displayName || 'Gast'}</Text>
              <Text style={styles.cardLocation}>Röbel/Müritz</Text>
            </View>
          </View>

          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{modeEmoji} {modeLabel}</Text>
            </View>
            {isCitizen && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>✅ Verifiziert</Text>
              </View>
            )}
          </View>

          <Text style={styles.cardFooter}>
            {pointsBalance > 0 ? `${pointsBalance} Röbel Punkte` : 'Willkommen in Röbel'}
          </Text>
        </View>
      </Animated.View>

      {/* BACK */}
      <Animated.View style={[styles.card, styles.cardBack, backStyle, { backgroundColor: backGradientColors[activeMode][0] }]}>
        <Text style={styles.flipHint}>↻</Text>

        <View style={styles.backContent}>
          <Text style={styles.backTitle}>{CARD_BACK_LABELS[activeMode]}</Text>

          <View style={styles.backBody}>
            <View style={styles.backInfoColumn}>
              {verifiedSince && (
                <>
                  <Text style={styles.backLabel}>Verifiziert seit</Text>
                  <Text style={styles.backValue}>{verifiedSince}</Text>
                </>
              )}

              {attestedBy > 0 && (
                <>
                  <Text style={[styles.backLabel, { marginTop: 8 }]}>Attestiert durch</Text>
                  <Text style={styles.backValue}>{attestedBy} Bürger</Text>
                </>
              )}

              {votingStreak > 0 && (
                <>
                  <Text style={[styles.backLabel, { marginTop: 8 }]}>Voting Streak</Text>
                  <Text style={styles.backValue}>{votingStreak} Wochen 🔥</Text>
                </>
              )}

              {businessName && (
                <>
                  <Text style={[styles.backLabel, { marginTop: 8 }]}>Organisation</Text>
                  <Text style={styles.backValue}>{businessName}</Text>
                </>
              )}

              {!verifiedSince && !businessName && (
                <>
                  <Text style={styles.backLabel}>Status</Text>
                  <Text style={styles.backValue}>Nicht verifiziert</Text>
                  <Text style={[styles.backLabel, { marginTop: 12 }]}>
                    Werde Bürger, um alle{'\n'}Funktionen freizuschalten
                  </Text>
                </>
              )}
            </View>

            <View style={styles.qrPlaceholder}>
              <Text style={styles.qrText}>QR</Text>
            </View>
          </View>

          {badges.length > 0 && (
            <View style={styles.badgesRow}>
              {badges.slice(0, 5).map((badge, i) => (
                <Text key={i} style={styles.badgeEmoji}>{badge}</Text>
              ))}
              {badges.length > 5 && (
                <Text style={styles.moreBadges}>+{badges.length - 5}</Text>
              )}
            </View>
          )}
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
    padding: 24,
    justifyContent: 'space-between',
  },
  cardBack: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  flipHint: {
    position: 'absolute',
    top: 14,
    right: 16,
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
  },
  frontContent: {
    flex: 1,
    justifyContent: 'space-between',
  },
  frontHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 24,
    fontFamily: 'Inter-Medium',
    color: '#ffffff',
  },
  frontHeaderText: {
    flex: 1,
  },
  cardName: {
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
  },
  cardLocation: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#ffffff',
  },
  cardFooter: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: 'rgba(255,255,255,0.6)',
  },
  backContent: {
    flex: 1,
    justifyContent: 'space-between',
  },
  backTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
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
    color: 'rgba(255,255,255,0.6)',
  },
  backValue: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
    marginTop: 1,
  },
  qrPlaceholder: {
    width: 72,
    height: 72,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: 'rgba(255,255,255,0.7)',
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  badgeEmoji: {
    fontSize: 18,
  },
  moreBadges: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    color: 'rgba(255,255,255,0.5)',
    marginLeft: 4,
  },
});
