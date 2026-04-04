import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import TierBadge from '@/components/RoleBadge';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import UserIcon from '@/assets/icons/user.svg';
import LocationSmallIcon from '@/assets/icons/location-small.svg';
import type { UserRecord } from '@/lib/types';

function isFieldVisible(privacy: Record<string, string> | null, field: string): boolean {
  if (!privacy) return true;
  return privacy[field] !== 'private';
}

export default function PublicProfileScreen() {
  const router = useRouter();
  const { username } = useLocalSearchParams<{ username: string }>();
  const { colors } = useTheme();

  const [user, setUser] = useState<UserRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!username) return;
    loadUser();
  }, [username]);

  const loadUser = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', username!)
        .single();

      if (error) throw error;
      setUser(data as UserRecord);
    } catch (error) {
      console.error('Error loading user:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
          </Pressable>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
          </Pressable>
        </View>
        <View style={styles.centered}>
          <Text style={[styles.emptyText, { color: colors.textTertiary }]}>Benutzer nicht gefunden</Text>
        </View>
      </SafeAreaView>
    );
  }

  const privacy = user.privacy_settings;
  const interests = Array.isArray(user.interests) ? user.interests : [];
  const vereine = Array.isArray(user.vereine) ? user.vereine : [];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Profil</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Avatar */}
        <View style={styles.avatarSection}>
          {user.profile_picture_url ? (
            <Image
              source={{ uri: user.profile_picture_url }}
              style={styles.avatar}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: colors.cardPlaceholder }]}>
              <UserIcon width={48} height={48} color={colors.textTertiary} />
            </View>
          )}

          {/* Username + Verified */}
          <View style={styles.nameRow}>
            <Text style={[styles.username, { color: colors.textPrimary }]}>@{user.username}</Text>
            {user.is_verified_citizen && (
              <View style={[styles.verifiedBadge, { backgroundColor: colors.success }]}>
                <Text style={styles.verifiedCheck}>✓</Text>
                <Text style={styles.verifiedText}>Verifiziert</Text>
              </View>
            )}
          </View>

          <TierBadge tier={user.tier} size="medium" />
        </View>

        {/* Bio */}
        {isFieldVisible(privacy, 'bio') && user.bio && (
          <View style={[styles.section, { borderTopColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Über mich</Text>
            <Text style={[styles.bioText, { color: colors.textSecondary }]}>{user.bio}</Text>
          </View>
        )}

        {/* Neighborhood */}
        {isFieldVisible(privacy, 'neighborhood') && user.neighborhood && (
          <View style={[styles.section, { borderTopColor: colors.border }]}>
            <View style={styles.locationRow}>
              <LocationSmallIcon width={16} height={16} color={colors.textTertiary} />
              <Text style={[styles.locationText, { color: colors.textSecondary }]}>{user.neighborhood}</Text>
            </View>
          </View>
        )}

        {/* Interests */}
        {isFieldVisible(privacy, 'interests') && interests.length > 0 && (
          <View style={[styles.section, { borderTopColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Interessen</Text>
            <View style={styles.tagsRow}>
              {interests.map((interest: string) => (
                <View key={interest} style={[styles.tag, { backgroundColor: colors.surfaceSecondary }]}>
                  <Text style={[styles.tagText, { color: colors.textSecondary }]}>{interest}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Vereine */}
        {isFieldVisible(privacy, 'vereine') && vereine.length > 0 && (
          <View style={[styles.section, { borderTopColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Vereine</Text>
            <View style={styles.tagsRow}>
              {vereine.map((verein: string) => (
                <View key={verein} style={[styles.tag, { backgroundColor: colors.surfaceSecondary }]}>
                  <Text style={[styles.tagText, { color: colors.textSecondary }]}>{verein}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Stats */}
        {isFieldVisible(privacy, 'gamification_points') && (
          <View style={[styles.section, { borderTopColor: colors.border }]}>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>{user.gamification_points}</Text>
                <Text style={[styles.statLabel, { color: colors.textTertiary }]}>Punkte</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>{user.total_votes_cast}</Text>
                <Text style={[styles.statLabel, { color: colors.textTertiary }]}>Abstimmungen</Text>
              </View>
            </View>
          </View>
        )}
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
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 12,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  username: {
    fontSize: 22,
    fontFamily: 'Inter-SemiBold',
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
  section: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    marginHorizontal: 16,
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
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  locationText: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  tagText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
  },
  statLabel: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
  },
});
