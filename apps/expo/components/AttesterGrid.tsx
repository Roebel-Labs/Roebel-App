import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import UserAvatarWithFrame from '@/components/UserAvatarWithFrame';
import { Skeleton } from '@/components/SkeletonLoader';
import type { AttesterProfile } from '@/lib/supabase-attesters';
import type { Account } from '@/lib/types';

interface AttesterGridProps {
  attesters: AttesterProfile[];
  isLoading: boolean;
}

const SECTION_PADDING = 16;
const COL_GAP = 12;

export default function AttesterGrid({ attesters, isLoading }: AttesterGridProps) {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();

  const contentWidth = screenWidth - SECTION_PADDING * 2;
  const orgCardWidth = (contentWidth - COL_GAP) / 2;
  const tileWidth = (contentWidth - COL_GAP * 2) / 3;

  const { orgs, personalAttesters } = useMemo(() => {
    const orgMap = new Map<string, Account>();
    const personal: AttesterProfile[] = [];
    for (const a of attesters) {
      // Every attester that resolves to a username is shown as an individual
      // citizen tile — even if they also own an org. Never render a wallet.
      if (a.user?.username) personal.push(a);
      // Dedupe orgs by id so a single org owned by multiple attesters appears once.
      for (const org of a.orgs) if (!orgMap.has(org.id)) orgMap.set(org.id, org);
    }
    return { orgs: Array.from(orgMap.values()), personalAttesters: personal };
  }, [attesters]);

  const cardBg = isDark ? colors.surface : '#FFFFFF';

  const renderOrgCard = (org: Account) => (
    <Pressable
      key={org.id}
      onPress={() => router.push(`/account/${org.id}` as any)}
      style={[
        styles.orgCard,
        { width: orgCardWidth, backgroundColor: cardBg, borderColor: colors.borderSecondary },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${org.name} ansehen`}
    >
      <View style={[styles.orgLogoWrap, { borderColor: colors.borderSecondary }]}>
        {org.avatar_url ? (
          <Image source={{ uri: org.avatar_url }} style={styles.orgLogoImage} contentFit="cover" />
        ) : (
          <View style={[styles.orgLogoFallback, { backgroundColor: colors.surface }]}>
            <Text style={[styles.orgLogoInitial, { color: colors.textPrimary }]}>
              {org.name.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
      </View>
      <Text style={[styles.orgName, { color: colors.textPrimary }]} numberOfLines={1}>
        {org.name}
      </Text>
      {!!org.bio && (
        <Text style={[styles.orgSubline, { color: colors.textSecondary }]} numberOfLines={1}>
          {org.bio}
        </Text>
      )}
      <View style={styles.orgLinkRow}>
        <Text style={[styles.orgLink, { color: colors.primary }]}>Ansehen </Text>
        <Text style={[styles.orgLink, { color: colors.primary }]}>→</Text>
      </View>
    </Pressable>
  );

  const renderPersonalTile = (a: AttesterProfile) => {
    // personalAttesters is pre-filtered to entries with a username.
    const name = a.user?.username ?? 'Bürger';
    return (
      <View
        key={a.wallet}
        style={[
          styles.personalTile,
          { width: tileWidth, backgroundColor: cardBg, borderColor: colors.borderSecondary },
        ]}
      >
        <UserAvatarWithFrame
          size={48}
          uri={a.user?.profile_picture_url ?? null}
          fallbackInitial={name.charAt(0).toUpperCase()}
          disabled
        />
        <Text style={[styles.personalName, { color: colors.textPrimary }]} numberOfLines={1}>
          {name}
        </Text>
      </View>
    );
  };

  const renderOrgSkeleton = (key: number) => (
    <View
      key={`org-sk-${key}`}
      style={[
        styles.orgCard,
        { width: orgCardWidth, backgroundColor: cardBg, borderColor: colors.borderSecondary },
      ]}
    >
      <Skeleton width={56} height={56} borderRadius={28} />
      <Skeleton width={'70%' as any} height={14} style={{ marginTop: 12 }} />
      <Skeleton width={'55%' as any} height={12} style={{ marginTop: 6 }} />
      <Skeleton width={'80%' as any} height={12} style={{ marginTop: 14 }} />
    </View>
  );

  return (
    <View style={styles.section}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Bescheiniger</Text>

      {isLoading && attesters.length === 0 ? (
        <View style={styles.grid}>
          {[0, 1, 2, 3].map(renderOrgSkeleton)}
        </View>
      ) : orgs.length === 0 && personalAttesters.length === 0 ? (
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
          Noch keine Bescheiniger.
        </Text>
      ) : (
        <>
          {orgs.length > 0 && <View style={styles.grid}>{orgs.map(renderOrgCard)}</View>}
          {personalAttesters.length > 0 && (
            <View style={[styles.grid, { marginTop: orgs.length > 0 ? 12 : 0 }]}>
              {personalAttesters.map(renderPersonalTile)}
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 24,
    paddingHorizontal: SECTION_PADDING,
  },
  title: {
    fontFamily: 'Inter-Medium',
    fontSize: 18,
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: COL_GAP,
  },
  orgCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  orgLogoWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orgLogoImage: {
    width: '100%',
    height: '100%',
  },
  orgLogoFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orgLogoInitial: {
    fontFamily: 'Inter-Medium',
    fontSize: 20,
  },
  orgName: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    marginTop: 10,
    textAlign: 'center',
  },
  orgSubline: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    marginTop: 2,
    textAlign: 'center',
  },
  orgLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  orgLink: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
  },
  personalTile: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  personalName: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  emptyText: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
});
