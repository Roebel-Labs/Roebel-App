import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Image,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import useOrgMembers from '@/hooks/useOrgMembers';
import OrgRoleBadge from '@/components/OrgRoleBadge';
import ConfirmationDrawer from '@/components/ConfirmationDrawer';
import InviteDrawer from '@/components/InviteDrawer';
import type { MemberWithProfile, InviteTokenWithUser, OrgRole } from '@/lib/types';

import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

export default function OrgManageScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { activeAccount } = useAccount();
  const accountId = activeAccount?.id;

  const {
    members,
    pendingInvites,
    currentUserRole,
    canManage,
    canLeave,
    isLoading,
    isRefreshing,
    refresh,
    removeMember,
    changeMemberRole,
    revokeInvite,
    leaveOrg,
  } = useOrgMembers(accountId);

  const [showInviteDrawer, setShowInviteDrawer] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'remove' | 'revoke' | 'leave' | 'change_role';
    target?: string;
    newRole?: OrgRole;
    name?: string;
  } | null>(null);
  const [isConfirmLoading, setIsConfirmLoading] = useState(false);
  const [showRoleMenu, setShowRoleMenu] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!confirmAction) return;
    setIsConfirmLoading(true);
    try {
      switch (confirmAction.type) {
        case 'remove':
          if (confirmAction.target) await removeMember(confirmAction.target);
          break;
        case 'revoke':
          if (confirmAction.target) await revokeInvite(confirmAction.target);
          break;
        case 'leave':
          await leaveOrg();
          router.replace('/profile');
          break;
        case 'change_role':
          if (confirmAction.target && confirmAction.newRole) {
            await changeMemberRole(confirmAction.target, confirmAction.newRole);
          }
          break;
      }
    } catch (error: any) {
      Alert.alert('Fehler', error?.message || 'Ein Fehler ist aufgetreten');
    } finally {
      setIsConfirmLoading(false);
      setConfirmAction(null);
    }
  };

  const getConfirmationProps = () => {
    if (!confirmAction) return { title: '', message: '', variant: 'info' as const };

    switch (confirmAction.type) {
      case 'remove':
        return {
          title: 'Mitglied entfernen',
          message: `Möchtest du ${confirmAction.name || 'dieses Mitglied'} wirklich aus der Organisation entfernen?`,
          variant: 'destructive' as const,
          confirmText: 'Entfernen',
        };
      case 'revoke':
        return {
          title: 'Einladung widerrufen',
          message: 'Möchtest du diese Einladung wirklich widerrufen?',
          variant: 'destructive' as const,
          confirmText: 'Widerrufen',
        };
      case 'leave':
        return {
          title: 'Organisation verlassen',
          message: `Möchtest du ${activeAccount?.name || 'diese Organisation'} wirklich verlassen?`,
          variant: 'destructive' as const,
          confirmText: 'Verlassen',
        };
      case 'change_role':
        return {
          title: 'Rolle ändern',
          message: `Möchtest du ${confirmAction.name || 'dieses Mitglied'} zum ${confirmAction.newRole === 'admin' ? 'Admin' : 'Mitglied'} ändern?`,
          variant: 'info' as const,
          confirmText: 'Ändern',
        };
    }
  };

  const renderMemberItem = ({ item }: { item: MemberWithProfile }) => {
    const isOwner = item.role === 'owner';
    const isSelf = item.wallet_address === members[0]?.wallet_address; // not comparing self correctly, we need user wallet
    const displayName = item.user?.username || `${item.wallet_address.slice(0, 6)}...${item.wallet_address.slice(-4)}`;
    const joinedDate = new Date(item.joined_at).toLocaleDateString('de-DE', { day: 'numeric', month: 'long' });
    const showMenu = canManage && !isOwner;

    return (
      <View style={[styles.memberRow, { backgroundColor: colors.surface }]}>
        {item.user?.profile_picture_url ? (
          <Image source={{ uri: item.user.profile_picture_url }} style={styles.memberAvatar} />
        ) : (
          <View style={[styles.memberAvatarPlaceholder, { backgroundColor: colors.surfaceSecondary }]}>
            <Text style={styles.memberInitials}>
              {displayName.slice(0, 2).toUpperCase()}
            </Text>
          </View>
        )}
        <View style={styles.memberInfo}>
          <Text style={[styles.memberName, { color: colors.textPrimary }]}>{displayName}</Text>
          <Text style={[styles.memberJoined, { color: colors.textTertiary }]}>
            Beigetreten {joinedDate}
          </Text>
        </View>
        <OrgRoleBadge role={item.role} />
        {showMenu && (
          <Pressable
            onPress={() => setShowRoleMenu(showRoleMenu === item.wallet_address ? null : item.wallet_address)}
            style={styles.menuButton}
          >
            <Text style={[styles.menuDots, { color: colors.textTertiary }]}>⋮</Text>
          </Pressable>
        )}
        {/* Inline overflow menu */}
        {showRoleMenu === item.wallet_address && (
          <View style={[styles.overflowMenu, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Pressable
              onPress={() => {
                setShowRoleMenu(null);
                const newRole = item.role === 'admin' ? 'member' : 'admin';
                setConfirmAction({
                  type: 'change_role',
                  target: item.wallet_address,
                  newRole,
                  name: displayName,
                });
              }}
              style={[styles.overflowItem, { borderBottomColor: colors.border }]}
            >
              <Text style={[styles.overflowText, { color: colors.textPrimary }]}>
                {item.role === 'admin' ? 'Zum Mitglied ändern' : 'Zum Admin befördern'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setShowRoleMenu(null);
                setConfirmAction({ type: 'remove', target: item.wallet_address, name: displayName });
              }}
              style={styles.overflowItem}
            >
              <Text style={[styles.overflowText, { color: colors.error }]}>Entfernen</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  const renderPendingInvite = ({ item }: { item: InviteTokenWithUser }) => {
    const isLinkInvite = !item.invited_wallet;
    const displayName = item.invited_user?.username || (isLinkInvite ? 'Einladungslink' : `${item.invited_wallet?.slice(0, 6)}...`);
    const daysLeft = Math.max(0, Math.ceil((new Date(item.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

    return (
      <View style={[styles.memberRow, { backgroundColor: colors.surface, opacity: 0.7 }]}>
        {item.invited_user?.profile_picture_url ? (
          <Image source={{ uri: item.invited_user.profile_picture_url }} style={styles.memberAvatar} />
        ) : (
          <View style={[styles.memberAvatarPlaceholder, { backgroundColor: colors.surfaceSecondary }]}>
            <Text style={styles.memberInitials}>{isLinkInvite ? '🔗' : displayName.slice(0, 2).toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.memberInfo}>
          <Text style={[styles.memberName, { color: colors.textPrimary }]}>{displayName}</Text>
          <Text style={[styles.memberJoined, { color: colors.textTertiary }]}>
            Läuft ab in {daysLeft} {daysLeft === 1 ? 'Tag' : 'Tagen'}
          </Text>
        </View>
        <OrgRoleBadge role={item.role} />
        {canManage && (
          <Pressable
            onPress={() => setConfirmAction({ type: 'revoke', target: item.id })}
            style={[styles.revokeButton, { borderColor: colors.error }]}
          >
            <Text style={[styles.revokeText, { color: colors.error }]}>Widerrufen</Text>
          </Pressable>
        )}
      </View>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Mitglieder verwalten</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const sections = [
    ...members.map((m) => ({ type: 'member' as const, data: m })),
    ...(pendingInvites.length > 0
      ? [
          { type: 'section_header' as const, data: null },
          ...pendingInvites.map((i) => ({ type: 'invite' as const, data: i })),
        ]
      : []),
    ...(canLeave ? [{ type: 'leave_button' as const, data: null }] : []),
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Mitglieder verwalten</Text>
        {canManage ? (
          <Pressable
            onPress={() => setShowInviteDrawer(true)}
            style={[styles.inviteButton, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.inviteButtonText, { color: colors.onPrimary }]}>+ Einladen</Text>
          </Pressable>
        ) : (
          <View style={styles.headerRight} />
        )}
      </View>

      {/* Content */}
      <FlatList
        data={sections}
        keyExtractor={(item, idx) => {
          if (item.type === 'member') return (item.data as MemberWithProfile).wallet_address;
          if (item.type === 'invite') return (item.data as InviteTokenWithUser).id;
          return `${item.type}-${idx}`;
        }}
        renderItem={({ item }) => {
          switch (item.type) {
            case 'member':
              return renderMemberItem({ item: item.data as MemberWithProfile });
            case 'invite':
              return renderPendingInvite({ item: item.data as InviteTokenWithUser });
            case 'section_header':
              return (
                <Text style={[styles.sectionHeader, { color: colors.textTertiary }]}>
                  Ausstehende Einladungen
                </Text>
              );
            case 'leave_button':
              return (
                <Pressable
                  onPress={() => setConfirmAction({ type: 'leave' })}
                  style={styles.leaveButton}
                >
                  <Text style={styles.leaveText}>Organisation verlassen</Text>
                </Pressable>
              );
          }
        }}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Keine Mitglieder gefunden
            </Text>
          </View>
        }
      />

      {/* Invite Drawer */}
      <InviteDrawer
        visible={showInviteDrawer}
        onClose={() => setShowInviteDrawer(false)}
        accountId={accountId || ''}
        existingMemberWallets={members.map((m) => m.wallet_address)}
        onInviteSent={refresh}
      />

      {/* Confirmation Drawer */}
      <ConfirmationDrawer
        visible={!!confirmAction}
        onCancel={() => setConfirmAction(null)}
        onConfirm={handleConfirm}
        isLoading={isConfirmLoading}
        {...getConfirmationProps()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  headerRight: { width: 80 },
  inviteButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  inviteButtonText: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
  },
  list: { padding: 16, gap: 8 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 14,
    gap: 12,
    position: 'relative',
  },
  memberAvatar: { width: 44, height: 44, borderRadius: 22 },
  memberAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberInitials: { fontSize: 14, fontFamily: 'Inter-Medium' },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 14, fontFamily: 'Inter-SemiBold' },
  memberJoined: { fontSize: 12, fontFamily: 'Inter-Regular', marginTop: 2 },
  menuButton: { paddingHorizontal: 8, paddingVertical: 4 },
  menuDots: { fontSize: 20, fontFamily: 'Inter-Bold' },
  overflowMenu: {
    position: 'absolute',
    right: 14,
    top: 56,
    borderRadius: 10,
    borderWidth: 1,
    zIndex: 10,
    minWidth: 180,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  overflowItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  overflowText: { fontSize: 14, fontFamily: 'Inter-Medium' },
  revokeButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  revokeText: { fontSize: 11, fontFamily: 'Inter-Medium' },
  sectionHeader: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
    marginTop: 16,
    marginBottom: 4,
  },
  leaveButton: {
    marginTop: 24,
    alignItems: 'center',
    paddingVertical: 14,
  },
  leaveText: { fontSize: 14, fontFamily: 'Inter-Medium', color: '#EF4444' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 40 },
  emptyText: { fontSize: 14, fontFamily: 'Inter-Regular' },
});
