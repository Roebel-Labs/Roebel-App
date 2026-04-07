import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import useInviteToken from '@/hooks/useInviteToken';
import OrgRoleBadge from '@/components/OrgRoleBadge';
import LoginDrawer from '@/components/LoginDrawer';

import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

const SUB_TYPE_LABEL: Record<string, string> = {
  restaurant: 'Restaurant',
  unternehmen: 'Unternehmen',
  verein: 'Verein',
  partei: 'Partei',
  fraktion: 'Fraktion',
};

export default function InviteTokenScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const [showLoginDrawer, setShowLoginDrawer] = useState(false);

  const {
    invite,
    isLoading,
    isExpired,
    isAlreadyMember,
    isAccepting,
    isDeclining,
    error,
    resolved,
    accept,
    decline,
    isLoggedIn,
  } = useInviteToken(token || '');

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error && !invite) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Einladung</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.centered}>
          <Text style={[styles.errorIcon]}>⚠️</Text>
          <Text style={[styles.errorTitle, { color: colors.textPrimary }]}>Einladung ungültig</Text>
          <Text style={[styles.errorMessage, { color: colors.textSecondary }]}>{error}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const account = invite?.account;
  const orgTypeLabel = account?.sub_type ? SUB_TYPE_LABEL[account.sub_type] || 'Organisation' : 'Organisation';
  const expiryDate = invite ? new Date(invite.expires_at).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Einladung</Text>
        <View style={styles.headerRight} />
      </View>

      <View style={styles.content}>
        {/* Org Info */}
        <View style={styles.orgSection}>
          {account?.avatar_url ? (
            <Image source={{ uri: account.avatar_url }} style={styles.orgAvatar} />
          ) : (
            <View style={[styles.orgAvatarPlaceholder, { backgroundColor: isDark ? '#1E3A5F' : '#DBEAFE' }]}>
              <Text style={styles.orgAvatarEmoji}>🏢</Text>
            </View>
          )}
          <Text style={[styles.orgName, { color: colors.textPrimary }]}>{account?.name}</Text>
          <Text style={[styles.orgType, { color: colors.textSecondary }]}>{orgTypeLabel}</Text>
          {account?.is_verified && (
            <Text style={[styles.verified, { color: isDark ? '#8AB4F8' : '#194383' }]}>Verifiziert ✓</Text>
          )}
        </View>

        {/* Invite Details */}
        <View style={[styles.detailsCard, { backgroundColor: colors.surface }]}>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: colors.textTertiary }]}>Eingeladen als</Text>
            <OrgRoleBadge role={invite?.role || 'member'} size="medium" />
          </View>
          {invite?.inviter && (
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.textTertiary }]}>Eingeladen von</Text>
              <View style={styles.inviterRow}>
                {invite.inviter.profile_picture_url ? (
                  <Image source={{ uri: invite.inviter.profile_picture_url }} style={styles.inviterAvatar} />
                ) : null}
                <Text style={[styles.detailValue, { color: colors.textPrimary }]}>
                  {invite.inviter.username || invite.invited_by.slice(0, 10) + '...'}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Status / Actions */}
        {isExpired ? (
          <View style={styles.statusSection}>
            <Text style={[styles.statusIcon]}>⏰</Text>
            <Text style={[styles.statusText, { color: colors.textSecondary }]}>
              Diese Einladung ist abgelaufen
            </Text>
          </View>
        ) : isAlreadyMember ? (
          <View style={styles.statusSection}>
            <Text style={[styles.statusIcon]}>✓</Text>
            <Text style={[styles.statusText, { color: colors.textSecondary }]}>
              Du bist bereits Mitglied dieser Organisation
            </Text>
          </View>
        ) : resolved ? (
          <View style={styles.statusSection}>
            <Text style={[styles.statusIcon]}>{resolved === 'accepted' ? '✓' : '✗'}</Text>
            <Text style={[styles.statusText, { color: colors.textSecondary }]}>
              {resolved === 'accepted' ? 'Einladung angenommen' : 'Einladung abgelehnt'}
            </Text>
          </View>
        ) : !isLoggedIn ? (
          <View style={styles.actionSection}>
            <Text style={[styles.loginHint, { color: colors.textSecondary }]}>
              Melde dich an, um diese Einladung anzunehmen
            </Text>
            <Pressable
              onPress={() => setShowLoginDrawer(true)}
              style={[styles.acceptButton, { backgroundColor: isDark ? '#8AB4F8' : '#194383' }]}
            >
              <Text style={[styles.acceptText, { color: isDark ? '#1a1a2e' : '#FFFFFF' }]}>Anmelden</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.actionSection}>
            <Pressable
              onPress={accept}
              disabled={isAccepting || isDeclining}
              style={[
                styles.acceptButton,
                { backgroundColor: isDark ? '#8AB4F8' : '#194383' },
                (isAccepting || isDeclining) && styles.disabledButton,
              ]}
            >
              {isAccepting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={[styles.acceptText, { color: isDark ? '#1a1a2e' : '#FFFFFF' }]}>Annehmen</Text>
              )}
            </Pressable>
            <Pressable
              onPress={decline}
              disabled={isAccepting || isDeclining}
              style={[
                styles.declineButton,
                { borderColor: colors.border },
                (isAccepting || isDeclining) && styles.disabledButton,
              ]}
            >
              {isDeclining ? (
                <ActivityIndicator color={colors.textSecondary} />
              ) : (
                <Text style={[styles.declineText, { color: colors.textSecondary }]}>Ablehnen</Text>
              )}
            </Pressable>
          </View>
        )}

        {/* Expiry Notice */}
        {!isExpired && !resolved && invite && (
          <Text style={[styles.expiryNote, { color: colors.textTertiary }]}>
            Gültig bis {expiryDate}
          </Text>
        )}

        {/* Error feedback */}
        {error && invite && (
          <Text style={[styles.errorFeedback, { color: colors.error }]}>{error}</Text>
        )}
      </View>

      <LoginDrawer visible={showLoginDrawer} onClose={() => setShowLoginDrawer(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-start' },
  headerTitle: { fontSize: 18, fontFamily: 'Inter-Medium' },
  headerRight: { width: 40 },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 32 },
  orgSection: { alignItems: 'center', marginBottom: 24 },
  orgAvatar: { width: 80, height: 80, borderRadius: 40, marginBottom: 12 },
  orgAvatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  orgAvatarEmoji: { fontSize: 32 },
  orgName: { fontSize: 22, fontFamily: 'Inter-Bold', marginBottom: 4 },
  orgType: { fontSize: 14, fontFamily: 'Inter-Regular', marginBottom: 4 },
  verified: { fontSize: 13, fontFamily: 'Inter-Medium' },
  detailsCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    gap: 16,
  },
  detailRow: { gap: 6 },
  detailLabel: { fontSize: 13, fontFamily: 'Inter-Regular' },
  detailValue: { fontSize: 15, fontFamily: 'Inter-Medium' },
  inviterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inviterAvatar: { width: 24, height: 24, borderRadius: 12 },
  statusSection: { alignItems: 'center', paddingVertical: 24 },
  statusIcon: { fontSize: 32, marginBottom: 8 },
  statusText: { fontSize: 15, fontFamily: 'Inter-Medium', textAlign: 'center' },
  actionSection: { gap: 10, marginTop: 8 },
  loginHint: { fontSize: 14, fontFamily: 'Inter-Regular', textAlign: 'center', marginBottom: 8 },
  acceptButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptText: { fontSize: 16, fontFamily: 'Inter-SemiBold' },
  declineButton: {
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineText: { fontSize: 16, fontFamily: 'Inter-Medium' },
  disabledButton: { opacity: 0.5 },
  expiryNote: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    marginTop: 16,
  },
  errorIcon: { fontSize: 48, marginBottom: 16 },
  errorTitle: { fontSize: 18, fontFamily: 'Inter-SemiBold', marginBottom: 8 },
  errorMessage: { fontSize: 14, fontFamily: 'Inter-Regular', textAlign: 'center' },
  errorFeedback: { fontSize: 13, fontFamily: 'Inter-Regular', textAlign: 'center', marginTop: 8 },
});
