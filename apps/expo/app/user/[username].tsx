import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useGoBack } from '@/hooks/useGoBack';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { supabase } from '@/lib/supabase';
import { fetchEquippedRewards } from '@/lib/supabase-rewards';
import type { LootboxReward, UserLootboxReward } from '@/lib/supabase-rewards';
import { fetchRoebelPointsCard } from '@/lib/supabase-roebel-points';
import type { RoebelPointsCardRecord } from '@/lib/supabase-roebel-points';
import { countUserVotes } from '@/lib/supabase-votes';
import TierBadge from '@/components/RoleBadge';
import UserAvatarWithFrame from '@/components/UserAvatarWithFrame';
import VerifiedBadge from '@/components/VerifiedBadge';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import UserIcon from '@/assets/icons/user.svg';
import LocationSmallIcon from '@/assets/icons/location-small.svg';
import ProfileCoverBanner from '@/components/profile/ProfileCoverBanner';
import ProfileTabs from '@/components/profile/ProfileTabs';
import UserPostsList from '@/components/profile/UserPostsList';
import MeckyNotFound from '@/components/MeckyNotFound';
import UserEventsList from '@/components/profile/UserEventsList';
import type { UserRecord } from '@/lib/types';

type TabKey = 'posts' | 'events';

function isFieldVisible(privacy: Record<string, string> | null, field: string): boolean {
  if (!privacy) return true;
  return privacy[field] !== 'private';
}

function formatJoinedDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
}

export default function PublicUserProfileScreen() {
  const goBack = useGoBack();
  const router = useRouter();
  const { username } = useLocalSearchParams<{ username: string }>();
  const { colors } = useTheme();
  const { user: currentUser } = useUser();

  const [profile, setProfile] = useState<UserRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [equipped, setEquipped] = useState<UserLootboxReward[]>([]);
  const [pointsCard, setPointsCard] = useState<RoebelPointsCardRecord | null>(null);
  const [voteCount, setVoteCount] = useState(0);
  const [activeTab, setActiveTab] = useState<TabKey>('posts');

  const loadProfile = useCallback(
    (signal: { cancelled: boolean }) => {
      if (!username) return;
      (async () => {
        setLoading(true);
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('username', username)
          .single();

        if (signal.cancelled) return;
        if (error) {
          console.error('Error loading user:', error);
          setProfile(null);
          setEquipped([]);
          setPointsCard(null);
          setVoteCount(0);
        } else {
          const userRow = data as UserRecord;
          setProfile(userRow);
          const [rewards, card, votes] = await Promise.all([
            fetchEquippedRewards(userRow.wallet_address),
            fetchRoebelPointsCard(userRow.wallet_address),
            countUserVotes(userRow.wallet_address),
          ]);
          if (!signal.cancelled) {
            setEquipped(rewards);
            setPointsCard(card);
            setVoteCount(votes);
          }
        }
        if (!signal.cancelled) setLoading(false);
      })();
    },
    [username]
  );

  // Refetch whenever the screen regains focus (e.g. returning from edit-profile)
  // so username / avatar / bio changes reflect without a manual reload.
  useFocusEffect(
    useCallback(() => {
      const signal = { cancelled: false };
      loadProfile(signal);
      return () => {
        signal.cancelled = true;
      };
    }, [loadProfile])
  );

  const isOwner = useMemo(() => {
    if (!currentUser || !profile) return false;
    return currentUser.wallet_address.toLowerCase() === profile.wallet_address.toLowerCase();
  }, [currentUser, profile]);

  const bannerReward = useMemo<LootboxReward | null>(() => {
    const hit = equipped.find((r) => r.reward?.type === 'profile_banner');
    return hit?.reward ?? null;
  }, [equipped]);

  const frameReward = useMemo<LootboxReward | null>(() => {
    const hit = equipped.find((r) => r.reward?.type === 'profile_frame');
    return hit?.reward ?? null;
  }, [equipped]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.topBar}>
          <Pressable onPress={goBack} style={styles.backButton} hitSlop={8}>
            <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
          </Pressable>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.topBar}>
          <Pressable onPress={goBack} style={styles.backButton} hitSlop={8}>
            <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
          </Pressable>
        </View>
        <MeckyNotFound title="Benutzer nicht gefunden" />
      </SafeAreaView>
    );
  }

  const privacy = profile.privacy_settings;
  const interests = Array.isArray(profile.interests) ? profile.interests : [];
  const vereine = Array.isArray(profile.vereine) ? profile.vereine : [];
  const displayName = profile.username ?? profile.wallet_address.slice(0, 10);
  const initial = displayName.charAt(0).toUpperCase();
  const bannerUrl = bannerReward?.asset_url ?? profile.cover_image_url ?? null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        stickyHeaderIndices={[3]}
      >
        {/* ── Cover banner with back chevron + optional edit pill ── */}
        <View style={styles.bannerWrap}>
          <ProfileCoverBanner assetUrl={bannerUrl} />
          <Pressable
            onPress={goBack}
            style={[styles.backPill, { backgroundColor: colors.background }]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Zurück"
          >
            <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
          </Pressable>
          {isOwner && (
            <Pressable
              onPress={() => router.push('/edit-profile' as any)}
              style={[styles.editPill, { backgroundColor: colors.background, borderColor: colors.border }]}
              accessibilityRole="button"
              accessibilityLabel="Profil bearbeiten"
            >
              <Text style={[styles.editPillText, { color: colors.textPrimary }]}>Bearbeiten</Text>
            </Pressable>
          )}
        </View>

        {/* ── Avatar + identity ── */}
        <View style={styles.identityRow}>
          <UserAvatarWithFrame
            size={AVATAR_SIZE}
            uri={profile.profile_picture_url}
            fallbackInitial={initial}
            frameAssetUrl={frameReward?.asset_url ?? null}
          />
        </View>

        {/* ── Name / tier / bio / location / joined ── */}
        <View style={styles.header}>
          <View style={styles.nameRow}>
            <Text style={[styles.displayName, { color: colors.textPrimary }]} numberOfLines={1}>
              {profile.username ?? displayName}
            </Text>
            {profile.is_verified_citizen && <VerifiedBadge size={20} />}
          </View>
          <View style={styles.subRow}>
            <TierBadge
              tier={profile.tier}
              size="medium"
              preferredRole={profile.preferred_role}
              isVerifiedCitizen={profile.is_verified_citizen}
            />
          </View>

          {isFieldVisible(privacy, 'bio') && profile.bio ? (
            <Text style={[styles.bio, { color: colors.textPrimary }]}>{profile.bio}</Text>
          ) : null}

          <View style={styles.metaRow}>
            {isFieldVisible(privacy, 'neighborhood') && profile.neighborhood ? (
              <View style={styles.metaItem}>
                <LocationSmallIcon width={14} height={14} color={colors.textTertiary} />
                <Text style={[styles.metaText, { color: colors.textTertiary }]}>
                  {profile.neighborhood}
                </Text>
              </View>
            ) : null}
            <View style={styles.metaItem}>
              <UserIcon width={14} height={14} color={colors.textTertiary} />
              <Text style={[styles.metaText, { color: colors.textTertiary }]}>
                Beigetreten {formatJoinedDate(profile.created_at)}
              </Text>
            </View>
          </View>

          {/* Stats */}
          {isFieldVisible(privacy, 'gamification_points') && (
            <View style={[styles.statsRow, { borderTopColor: colors.border, borderBottomColor: colors.border }]}>
              <View style={styles.stat}>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                  {pointsCard?.points_balance ?? 0}
                </Text>
                <Text style={[styles.statLabel, { color: colors.textTertiary }]}>Münzen</Text>
              </View>
              <View style={styles.stat}>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                  {voteCount}
                </Text>
                <Text style={[styles.statLabel, { color: colors.textTertiary }]}>Abstimmungen</Text>
              </View>
              <View style={styles.stat}>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                  {pointsCard?.streak_days ?? 0}
                </Text>
                <Text style={[styles.statLabel, { color: colors.textTertiary }]}>Streak</Text>
              </View>
            </View>
          )}

          {/* Interests / Vereine pills */}
          {isFieldVisible(privacy, 'interests') && interests.length > 0 && (
            <View style={styles.pillsRow}>
              {interests.slice(0, 8).map((interest) => (
                <View
                  key={interest}
                  style={[styles.pill, { backgroundColor: colors.surfaceSecondary }]}
                >
                  <Text style={[styles.pillText, { color: colors.textSecondary }]}>{interest}</Text>
                </View>
              ))}
            </View>
          )}
          {isFieldVisible(privacy, 'vereine') && vereine.length > 0 && (
            <View style={styles.pillsRow}>
              {vereine.map((verein) => (
                <View
                  key={verein}
                  style={[styles.pill, { backgroundColor: colors.surfaceSecondary }]}
                >
                  <Text style={[styles.pillText, { color: colors.textSecondary }]}>{verein}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── Tabs (sticky) ── */}
        <View style={{ backgroundColor: colors.background }}>
          <ProfileTabs<TabKey>
            tabs={[
              { key: 'posts', label: 'Beiträge' },
              { key: 'events', label: 'Veranstaltungen' },
            ]}
            active={activeTab}
            onChange={setActiveTab}
          />
        </View>

        {/* ── Tab body ── */}
        <View>
          {activeTab === 'posts' ? (
            <UserPostsList walletAddress={profile.wallet_address} />
          ) : (
            <UserEventsList walletAddress={profile.wallet_address} />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const AVATAR_SIZE = 96;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  bannerWrap: {
    position: 'relative',
  },
  backPill: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  editPill: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  editPillText: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: -(AVATAR_SIZE / 2),
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  displayName: {
    fontSize: 22,
    fontFamily: 'Inter-SemiBold',
    flexShrink: 1,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bio: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    lineHeight: 22,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 6,
    columnGap: 16,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
    marginTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
  },
  statLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginTop: 2,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  pillText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
});
