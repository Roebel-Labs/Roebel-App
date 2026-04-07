import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useUser } from '@/context/UserContext';
import {
  fetchOwnedAccounts,
  fetchAccountById,
  createOrgAccount as createOrgAccountDB,
  switchActiveAccount as switchActiveAccountDB,
  inviteOwner as inviteOwnerDB,
  removeOwner as removeOwnerDB,
} from '@/lib/supabase-accounts';
import { getAccountRole, type AccountRole } from '@/lib/supabase-account-roles';
import type { Account, OrgSubType } from '@/lib/types';

const ACTIVE_ACCOUNT_KEY = '@active_account_id';

interface AccountContextValue {
  activeAccount: Account | null;
  ownedAccounts: Account[];
  roleInActiveAccount: AccountRole | null;
  switchAccount: (accountId: string) => Promise<void>;
  createOrgAccount: (subType: OrgSubType, name: string) => Promise<Account>;
  inviteCitizen: (accountId: string, walletAddress: string) => Promise<void>;
  removeCitizen: (accountId: string, walletAddress: string) => Promise<void>;
  isOwnerOf: (accountId: string | null) => boolean;
  isLoading: boolean;
  refreshAccounts: () => Promise<void>;
}

const AccountContext = createContext<AccountContextValue | undefined>(undefined);

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const walletAddress = user?.wallet_address;

  const [activeAccount, setActiveAccount] = useState<Account | null>(null);
  const [ownedAccounts, setOwnedAccounts] = useState<Account[]>([]);
  const [roleInActiveAccount, setRoleInActiveAccount] = useState<AccountRole | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Load accounts when user connects
  const refreshAccounts = useCallback(async () => {
    if (!walletAddress) {
      setOwnedAccounts([]);
      setActiveAccount(null);
      return;
    }

    setIsLoading(true);
    try {
      const accounts = await fetchOwnedAccounts(walletAddress);
      setOwnedAccounts(accounts);

      // Determine active account
      if (user?.active_account_id) {
        const active = accounts.find((a) => a.id === user.active_account_id);
        if (active) {
          setActiveAccount(active);
        } else {
          // Fallback: try fetching directly (might be an account not yet in local list)
          const fetched = await fetchAccountById(user.active_account_id);
          setActiveAccount(fetched || accounts.find((a: Account) => a.account_type === 'personal') || null);
        }
      } else {
        // Default to personal account
        const personal = accounts.find((a) => a.account_type === 'personal');
        setActiveAccount(personal || null);
      }
    } catch (error) {
      console.error('Failed to load accounts:', error);
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress, user?.active_account_id]);

  useEffect(() => {
    refreshAccounts();
  }, [refreshAccounts]);

  // Fetch role when active account changes
  useEffect(() => {
    if (activeAccount && walletAddress) {
      getAccountRole(activeAccount.id, walletAddress).then(setRoleInActiveAccount);
    } else {
      setRoleInActiveAccount(null);
    }
  }, [activeAccount?.id, walletAddress]);

  // Reset on disconnect
  useEffect(() => {
    if (!walletAddress) {
      setActiveAccount(null);
      setOwnedAccounts([]);
      setRoleInActiveAccount(null);
    }
  }, [walletAddress]);

  const switchAccount = useCallback(
    async (accountId: string) => {
      if (!walletAddress) throw new Error('No wallet connected');

      await switchActiveAccountDB(walletAddress, accountId);
      await AsyncStorage.setItem(ACTIVE_ACCOUNT_KEY, accountId);

      const account = ownedAccounts.find((a) => a.id === accountId);
      if (account) {
        setActiveAccount(account);
      } else {
        const fetched = await fetchAccountById(accountId);
        if (fetched) setActiveAccount(fetched);
      }
    },
    [walletAddress, ownedAccounts]
  );

  const createOrgAccount = useCallback(
    async (subType: OrgSubType, name: string): Promise<Account> => {
      if (!walletAddress) throw new Error('No wallet connected');

      const account = await createOrgAccountDB(walletAddress, subType, name);
      if (!account) throw new Error('Failed to create organization');

      setOwnedAccounts((prev) => [...prev, account]);
      return account;
    },
    [walletAddress]
  );

  const inviteCitizen = useCallback(
    async (accountId: string, citizenWallet: string) => {
      if (!walletAddress) throw new Error('No wallet connected');
      await inviteOwnerDB(accountId, citizenWallet, walletAddress);
    },
    [walletAddress]
  );

  const removeCitizen = useCallback(
    async (accountId: string, citizenWallet: string) => {
      await removeOwnerDB(accountId, citizenWallet);
    },
    []
  );

  const isOwnerOf = useCallback(
    (accountId: string | null): boolean => {
      if (!accountId) return false;
      return ownedAccounts.some((a) => a.id === accountId);
    },
    [ownedAccounts]
  );

  const value = useMemo<AccountContextValue>(
    () => ({
      activeAccount,
      ownedAccounts,
      roleInActiveAccount,
      switchAccount,
      createOrgAccount,
      inviteCitizen,
      removeCitizen,
      isOwnerOf,
      isLoading,
      refreshAccounts,
    }),
    [activeAccount, ownedAccounts, roleInActiveAccount, switchAccount, createOrgAccount, inviteCitizen, removeCitizen, isOwnerOf, isLoading, refreshAccounts]
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountContextValue {
  const context = useContext(AccountContext);
  if (!context) {
    throw new Error('useAccount must be used within AccountProvider');
  }
  return context;
}
