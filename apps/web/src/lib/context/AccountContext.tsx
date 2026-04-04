"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { useActiveAccount } from "thirdweb/react";
import {
  fetchOwnedAccounts,
  fetchAccountById,
  createOrgAccount as createOrgAccountDB,
  switchActiveAccount as switchActiveAccountDB,
  inviteOwner as inviteOwnerDB,
  removeOwner as removeOwnerDB,
} from "@/lib/supabase-accounts";
import { supabase } from "@/lib/supabase";
import type { Account, OrgType } from "@/types/account";

const STORAGE_KEY = "roebel-active-account-id";

interface AccountContextValue {
  activeAccount: Account | null;
  ownedAccounts: Account[];
  switchAccount: (accountId: string) => Promise<void>;
  createOrgAccount: (type: OrgType, name: string) => Promise<Account>;
  inviteCitizen: (accountId: string, walletAddress: string) => Promise<void>;
  removeCitizen: (accountId: string, walletAddress: string) => Promise<void>;
  isOwnerOf: (accountId: string | null) => boolean;
  isLoading: boolean;
  refreshAccounts: () => Promise<void>;
}

const AccountContext = createContext<AccountContextValue | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const thirdwebAccount = useActiveAccount();
  const walletAddress = thirdwebAccount?.address;

  const [activeAccount, setActiveAccount] = useState<Account | null>(null);
  const [ownedAccounts, setOwnedAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load accounts when wallet connects
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

      // Get user's active_account_id from DB
      const { data: userData } = await supabase
        .from("users")
        .select("active_account_id")
        .eq("wallet_address", walletAddress.toLowerCase())
        .single();

      const activeAccountId =
        userData?.active_account_id ||
        localStorage.getItem(STORAGE_KEY);

      if (activeAccountId) {
        const active = accounts.find((a) => a.id === activeAccountId);
        if (active) {
          setActiveAccount(active);
        } else {
          // Fallback: try fetching directly
          const fetched = await fetchAccountById(activeAccountId);
          setActiveAccount(
            fetched ||
              accounts.find((a) => a.account_type === "personal") ||
              null
          );
        }
      } else {
        // Default to personal account
        const personal = accounts.find(
          (a) => a.account_type === "personal"
        );
        setActiveAccount(personal || null);
      }
    } catch (error) {
      console.error("Failed to load accounts:", error);
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    refreshAccounts();
  }, [refreshAccounts]);

  // Reset on disconnect
  useEffect(() => {
    if (!walletAddress) {
      setActiveAccount(null);
      setOwnedAccounts([]);
    }
  }, [walletAddress]);

  const switchAccount = useCallback(
    async (accountId: string) => {
      if (!walletAddress) throw new Error("No wallet connected");

      await switchActiveAccountDB(walletAddress, accountId);
      localStorage.setItem(STORAGE_KEY, accountId);

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
    async (type: OrgType, name: string): Promise<Account> => {
      if (!walletAddress) throw new Error("No wallet connected");

      const account = await createOrgAccountDB(walletAddress, type, name);
      if (!account) throw new Error("Failed to create organization");

      setOwnedAccounts((prev) => [...prev, account]);
      return account;
    },
    [walletAddress]
  );

  const inviteCitizen = useCallback(
    async (accountId: string, citizenWallet: string) => {
      if (!walletAddress) throw new Error("No wallet connected");
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
      switchAccount,
      createOrgAccount,
      inviteCitizen,
      removeCitizen,
      isOwnerOf,
      isLoading,
      refreshAccounts,
    }),
    [
      activeAccount,
      ownedAccounts,
      switchAccount,
      createOrgAccount,
      inviteCitizen,
      removeCitizen,
      isOwnerOf,
      isLoading,
      refreshAccounts,
    ]
  );

  return (
    <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
  );
}

export function useAccount(): AccountContextValue {
  const ctx = useContext(AccountContext);
  if (!ctx) {
    throw new Error("useAccount must be used within <AccountProvider>");
  }
  return ctx;
}
