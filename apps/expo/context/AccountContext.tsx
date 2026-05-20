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
  deleteAccount as deleteAccountDB,
  type CreateOrgAccountOptions,
} from '@/lib/supabase-accounts';
import { getAccountRole, type AccountRole } from '@/lib/supabase-account-roles';
import type { Account, OrgSubType } from '@/lib/types';

const ACTIVE_ACCOUNT_KEY = '@active_account_id';
const RECENT_ACCOUNT_IDS_KEY = '@recent_account_ids';
const RECENT_ACCOUNT_IDS_CAP = 5;

interface AccountContextValue {
  activeAccount: Account | null;
  ownedAccounts: Account[];
  recentOtherAccounts: Account[];
  roleInActiveAccount: AccountRole | null;
  switchAccount: (accountId: string) => Promise<void>;
  createOrgAccount: (
    subType: OrgSubType,
    name: string,
    options?: CreateOrgAccountOptions
  ) => Promise<Account>;
  inviteCitizen: (accountId: string, walletAddress: string) => Promise<void>;
  removeCitizen: (accountId: string, walletAddress: string) => Promise<void>;
  deleteOrgAccount: (accountId: string) => Promise<void>;
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
  const [recentAccountIds, setRecentAccountIds] = useState<string[]>([]);
  const [roleInActiveAccount, setRoleInActiveAccount] = useState<AccountRole | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Restore MRU list from AsyncStorage on mount
  useEffect(() => {
    AsyncStorage.getItem(RECENT_ACCOUNT_IDS_KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
            setRecentAccountIds(parsed.slice(0, RECENT_ACCOUNT_IDS_CAP));
          }
        } catch {
          // ignore malformed storage value
        }
      })
      .catch(() => {});
  }, []);

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
      setRecentAccountIds([]);
      AsyncStorage.removeItem(RECENT_ACCOUNT_IDS_KEY).catch(() => {});
    }
  }, [walletAddress]);

  const switchAccount = useCallback(
    async (accountId: string) => {
      if (!walletAddress) throw new Error('No wallet connected');

      const prevId = activeAccount?.id;

      await switchActiveAccountDB(walletAddress, accountId);
      await AsyncStorage.setItem(ACTIVE_ACCOUNT_KEY, accountId);

      const account = ownedAccounts.find((a) => a.id === accountId);
      if (account) {
        setActiveAccount(account);
      } else {
        const fetched = await fetchAccountById(accountId);
        if (fetched) setActiveAccount(fetched);
      }

      if (prevId && prevId !== accountId) {
        setRecentAccountIds((prev) => {
          const next = [prevId, ...prev.filter((id) => id !== prevId && id !== accountId)].slice(
            0,
            RECENT_ACCOUNT_IDS_CAP
          );
          AsyncStorage.setItem(RECENT_ACCOUNT_IDS_KEY, JSON.stringify(next)).catch(() => {});
          return next;
        });
      }
    },
    [walletAddress, ownedAccounts, activeAccount?.id]
  );

  const createOrgAccount = useCallback(
    async (
      subType: OrgSubType,
      name: string,
      options?: CreateOrgAccountOptions
    ): Promise<Account> => {
      if (!walletAddress) throw new Error('No wallet connected');

      const account = await createOrgAccountDB(walletAddress, subType, name, options);
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

  const deleteOrgAccount = useCallback(
    async (accountId: string) => {
      await deleteAccountDB(accountId);
      setOwnedAccounts((prev) => prev.filter((a) => a.id !== accountId));
      setActiveAccount((curr) => (curr?.id === accountId ? null : curr));
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

  const recentOtherAccounts = useMemo<Account[]>(() => {
    const activeId = activeAccount?.id;
    const byId = new Map(ownedAccounts.map((a) => [a.id, a]));
    const mruResolved = recentAccountIds
      .map((id) => byId.get(id))
      .filter((a): a is Account => !!a && a.id !== activeId);
    const filler = ownedAccounts.filter(
      (a) => a.id !== activeId && !recentAccountIds.includes(a.id)
    );
    return [...mruResolved, ...filler].slice(0, 2);
  }, [recentAccountIds, ownedAccounts, activeAccount?.id]);

  const value = useMemo<AccountContextValue>(
    () => ({
      activeAccount,
      ownedAccounts,
      recentOtherAccounts,
      roleInActiveAccount,
      switchAccount,
      createOrgAccount,
      inviteCitizen,
      removeCitizen,
      deleteOrgAccount,
      isOwnerOf,
      isLoading,
      refreshAccounts,
    }),
    [activeAccount, ownedAccounts, recentOtherAccounts, roleInActiveAccount, switchAccount, createOrgAccount, inviteCitizen, removeCitizen, deleteOrgAccount, isOwnerOf, isLoading, refreshAccounts]
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
