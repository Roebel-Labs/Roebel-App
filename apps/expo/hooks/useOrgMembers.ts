import { useState, useEffect, useCallback } from 'react';
import { useUser } from '@/context/UserContext';
import { useAccount } from '@/context/AccountContext';
import { getAccountRole, updateMemberRole, canManageMembers, canLeaveOrg } from '@/lib/supabase-account-roles';
import { fetchMembersWithProfiles, removeMember as removeMemberDB, leaveOrg as leaveOrgDB } from '@/lib/supabase-member-management';
import { fetchPendingInvites, revokeInvite as revokeInviteDB } from '@/lib/supabase-invites';
import type { AccountRole } from '@/lib/supabase-account-roles';
import type { MemberWithProfile, InviteTokenWithUser, OrgRole } from '@/lib/types';

export default function useOrgMembers(accountId: string | undefined) {
  const { user } = useUser();
  const { refreshAccounts } = useAccount();
  const walletAddress = user?.wallet_address;

  const [members, setMembers] = useState<MemberWithProfile[]>([]);
  const [pendingInvites, setPendingInvites] = useState<InviteTokenWithUser[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<AccountRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const ownerCount = members.filter((m) => m.role === 'owner').length;
  const canManage = canManageMembers(currentUserRole);
  const canLeave = canLeaveOrg(currentUserRole, ownerCount);

  const load = useCallback(async () => {
    if (!accountId || !walletAddress) return;

    try {
      const [membersData, invitesData, role] = await Promise.all([
        fetchMembersWithProfiles(accountId),
        fetchPendingInvites(accountId),
        getAccountRole(accountId, walletAddress),
      ]);

      setMembers(membersData);
      setPendingInvites(invitesData);
      setCurrentUserRole(role);
    } catch (error) {
      console.error('useOrgMembers load error:', error);
    }
  }, [accountId, walletAddress]);

  useEffect(() => {
    setIsLoading(true);
    load().finally(() => setIsLoading(false));
  }, [load]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  }, [load]);

  const removeMember = useCallback(
    async (memberWallet: string) => {
      if (!accountId) return;
      await removeMemberDB(accountId, memberWallet);
      await load();
    },
    [accountId, load]
  );

  const changeMemberRole = useCallback(
    async (memberWallet: string, newRole: OrgRole) => {
      if (!accountId) return;
      await updateMemberRole(accountId, memberWallet, newRole as AccountRole);
      await load();
    },
    [accountId, load]
  );

  const revokeInvite = useCallback(
    async (inviteId: string) => {
      await revokeInviteDB(inviteId);
      await load();
    },
    [load]
  );

  const leaveOrg = useCallback(async () => {
    if (!accountId || !walletAddress) return;
    await leaveOrgDB(accountId, walletAddress);
    await refreshAccounts();
  }, [accountId, walletAddress, refreshAccounts]);

  return {
    members,
    pendingInvites,
    currentUserRole,
    ownerCount,
    canManage,
    canLeave,
    isLoading,
    isRefreshing,
    refresh,
    removeMember,
    changeMemberRole,
    revokeInvite,
    leaveOrg,
  };
}
