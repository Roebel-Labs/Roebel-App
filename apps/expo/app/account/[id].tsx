import React, { useEffect, useState, useLayoutEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useGoBack } from '@/hooks/useGoBack';
import { Image } from 'expo-image';
import { useTheme } from '@/context/ThemeContext';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import UserIcon from '@/assets/icons/user.svg';
import AvatarStack from '@/components/AvatarStack';
import { QualityStampSection } from '@/components/QualityStampSection';
import { fetchAccountById } from '@/lib/supabase-accounts';
import { fetchMembersWithProfiles } from '@/lib/supabase-member-management';
import type { Account, MemberWithProfile, OrgSubType } from '@/lib/types';

const SUB_TYPE_LABELS: Record<OrgSubType, { emoji: string; label: string }> = {
  verein: { emoji: '🏛️', label: 'Verein' },
  restaurant: { emoji: '🍽️', label: 'Restaurant' },
  partei: { emoji: '🎗️', label: 'Partei' },
  fraktion: { emoji: '📋', label: 'Fraktion' },
  unternehmen: { emoji: '🏢', label: 'Unternehmen' },
};

function subTypeLabel(subType: OrgSubType | null): { emoji: string; label: string } | null {
  if (!subType) return null;
  return SUB_TYPE_LABELS[subType] ?? null;
}

export default function PublicAccountScreen() {
  const goBack = useGoBack();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const navigation = useNavigation();

  useLayoutEffect(() => {
    navigation.setOptions({
      presentation: 'formSheet',
      sheetAllowedDetents: [0.6, 1.0],
      sheetInitialDetentIndex: 0,
      sheetGrabberVisible: true,
      sheetCornerRadius: 20,
    } as any);
  }, [navigation]);

  const [account, setAccount] = useState<Account | null>(null);
  const [members, setMembers] = useState<MemberWithProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [acc, mem] = await Promise.all([
          fetchAccountById(id),
          fetchMembersWithProfiles(id),
        ]);
        if (cancelled) return;
        setAccount(acc);
        setMembers(mem);
      } catch (err) {
        console.error('Error loading account:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={goBack} style={styles.backButton}>
            <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
          </Pressable>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!account || account.account_type !== 'organisation') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={goBack} style={styles.backButton}>
            <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Profil</Text>
          <View style={styles.backButton} />
        </View>
        <View style={styles.centered}>
          <Text style={[styles.emptyText, { color: colors.textTertiary }]}>Nicht verfügbar</Text>
        </View>
      </SafeAreaView>
    );
  }

  const subType = subTypeLabel(account.sub_type);
  const memberAvatars = members.slice(0, 3).map((m) => ({
    avatar_url: m.user?.profile_picture_url ?? null,
    username: m.user?.username ?? null,
  }));

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Banner */}
        <View style={[styles.banner, { backgroundColor: colors.cardPlaceholder }]}>
          {account.cover_url ? (
            <Image
              source={{ uri: account.cover_url }}
              style={StyleSheet.absoluteFill as any}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
          ) : null}
          <Pressable onPress={goBack} style={[styles.backPill, { backgroundColor: colors.background }]} hitSlop={8}>
            <ChevronLeftIcon width={20} height={20} color={colors.textPrimary} />
          </Pressable>
        </View>

        {/* Avatar + name */}
        <View style={styles.avatarSection}>
          {account.avatar_url ? (
            <Image
              source={{ uri: account.avatar_url }}
              style={[styles.avatar, { borderColor: colors.background }]}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: colors.cardPlaceholder, borderColor: colors.background }]}>
              <UserIcon width={36} height={36} color={colors.textTertiary} />
            </View>
          )}

          <View style={styles.nameRow}>
            <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={2}>
              {account.name}
            </Text>
            {account.is_verified && (
              <View style={[styles.verifiedBadge, { backgroundColor: colors.success }]}>
                <Text style={styles.verifiedCheck}>✓</Text>
                <Text style={styles.verifiedText}>Verifiziert</Text>
              </View>
            )}
          </View>

          {subType && (
            <View style={[styles.subTypePill, { backgroundColor: colors.surfaceSecondary }]}>
              <Text style={[styles.subTypeText, { color: colors.textSecondary }]}>
                {subType.emoji} {subType.label}
              </Text>
            </View>
          )}
        </View>

        {/* Bio */}
        {account.bio ? (
          <View style={[styles.section, { borderTopColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Über uns</Text>
            <Text style={[styles.bioText, { color: colors.textSecondary }]}>{account.bio}</Text>
          </View>
        ) : null}

        {/* Members */}
        {members.length > 0 && (
          <View style={[styles.section, { borderTopColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Mitglieder</Text>
            <View style={styles.membersRow}>
              <AvatarStack
                users={memberAvatars}
                totalCount={members.length}
                maxVisible={3}
                size="large"
              />
              <Text style={[styles.membersCount, { color: colors.textSecondary }]}>
                {members.length} {members.length === 1 ? 'Mitglied' : 'Mitglieder'}
              </Text>
            </View>
          </View>
        )}

        {/* Actions */}
        <View style={[styles.section, { borderTopColor: colors.border }]}>
          <Pressable
            onPress={() =>
              router.push({ pathname: '/explore', params: { accountId: account.id } })
            }
            style={({ pressed }) => [
              styles.actionButton,
              { backgroundColor: colors.primary },
              pressed && styles.actionButtonPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Beiträge und Veranstaltungen dieser Organisation ansehen"
          >
            <Text style={[styles.actionButtonText, { color: colors.onPrimary }]}>
              Beiträge & Veranstaltungen ansehen
            </Text>
          </Pressable>
        </View>

        <QualityStampSection title="Organisationen sind geprüft auf Qualität" />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
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
  banner: {
    width: '100%',
    height: 160,
    overflow: 'hidden',
    position: 'relative',
  },
  backPill: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  avatarSection: {
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: -48,
    gap: 10,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 4,
  },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingTop: 4,
    paddingHorizontal: 16,
  },
  name: {
    fontSize: 22,
    fontFamily: 'Inter-SemiBold',
    textAlign: 'center',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 12,
    gap: 4,
  },
  verifiedCheck: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
  },
  verifiedText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#ffffff',
  },
  subTypePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  subTypeText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    marginHorizontal: 16,
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 8,
  },
  bioText: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    lineHeight: 22,
  },
  membersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  membersCount: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  actionButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  actionButtonPressed: {
    opacity: 0.9,
  },
  actionButtonText: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
  },
});
