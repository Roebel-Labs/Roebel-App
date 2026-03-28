import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useActiveAccount, useActiveWallet } from 'thirdweb/react';
import { getUserEmail } from 'thirdweb/wallets/in-app';
import { client } from '@/constants/thirdweb';
import { useVerificationContext } from '@/context/VerificationContext';
import { upsertUser, updateUserProfile, updateUserRole, fetchUserByWallet } from '@/lib/supabase-users';
import { fetchBusinessesByOwner, createBusiness } from '@/lib/supabase-businesses';
import type { UserRecord, UserRole, BusinessRecord, AccountMode, CreateBusinessInput } from '@/lib/types';

const ACCOUNT_MODE_KEY = '@account_mode';

const ROLE_LABELS: Record<UserRole, string> = {
  tourist: 'Gast',
  resident: 'Bürger',
  business: 'Gewerbetreibender',
  official: 'Offiziell',
};

interface UserContextValue {
  user: UserRecord | null;
  isLoading: boolean;

  accountMode: AccountMode;
  setAccountMode: (mode: AccountMode) => void;

  userBusiness: BusinessRecord | null;
  isBusinessLoading: boolean;

  role: UserRole;
  roleLabel: string;
  isCitizen: boolean;
  isBusinessOwner: boolean;

  refreshUser: () => Promise<void>;
  updateProfile: (updates: { username?: string; bio?: string; profile_picture_url?: string }) => Promise<void>;
  createBusinessProfile: (input: Omit<CreateBusinessInput, 'owner_wallet_address'>) => Promise<void>;
  refreshBusiness: () => Promise<void>;
}

const UserContext = createContext<UserContextValue | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const account = useActiveAccount();
  const wallet = useActiveWallet();
  const { hasCitizenNFT } = useVerificationContext();

  const [user, setUser] = useState<UserRecord | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [accountMode, setAccountModeState] = useState<AccountMode>('personal');
  const [userBusiness, setUserBusiness] = useState<BusinessRecord | null>(null);
  const [isBusinessLoading, setIsBusinessLoading] = useState(false);

  // Load persisted account mode
  useEffect(() => {
    AsyncStorage.getItem(ACCOUNT_MODE_KEY).then(value => {
      if (value === 'personal' || value === 'business') {
        setAccountModeState(value);
      }
    });
  }, []);

  const setAccountMode = useCallback((mode: AccountMode) => {
    setAccountModeState(mode);
    AsyncStorage.setItem(ACCOUNT_MODE_KEY, mode);
  }, []);

  // Sync user on login/account change
  useEffect(() => {
    if (!account?.address) {
      setUser(null);
      setUserBusiness(null);
      setAccountModeState('personal');
      return;
    }

    async function syncUser() {
      setIsLoading(true);
      try {
        let email: string | undefined;
        if (wallet && wallet.id === 'inApp') {
          try {
            email = await getUserEmail({ client });
          } catch {
            // Email retrieval may fail
          }
        }

        const userRecord = await upsertUser(account!.address, email);
        setUser(userRecord);
      } catch (error) {
        console.error('Failed to sync user:', error);
      } finally {
        setIsLoading(false);
      }
    }

    syncUser();
  }, [account?.address, wallet]);

  // Fetch user's businesses
  const refreshBusiness = useCallback(async () => {
    if (!account?.address) {
      setUserBusiness(null);
      return;
    }

    setIsBusinessLoading(true);
    try {
      const businesses = await fetchBusinessesByOwner(account.address);
      // Prefer approved business, fall back to first one
      const primary = businesses.find(b => b.status === 'approved') || businesses[0] || null;
      setUserBusiness(primary);
    } catch (error) {
      console.error('Failed to fetch businesses:', error);
    } finally {
      setIsBusinessLoading(false);
    }
  }, [account?.address]);

  useEffect(() => {
    if (account?.address) {
      refreshBusiness();
    }
  }, [account?.address]);

  // Auto-upgrade role when citizen NFT is detected
  useEffect(() => {
    if (user && hasCitizenNFT && user.role === 'tourist') {
      updateUserRole(user.wallet_address, 'resident', true)
        .then(() => {
          setUser(prev =>
            prev ? { ...prev, role: 'resident', is_verified_citizen: true, verification_status: 'approved' as const } : null
          );
        })
        .catch(err => console.error('Failed to upgrade role:', err));
    }
  }, [hasCitizenNFT, user?.role, user?.wallet_address]);

  const refreshUser = useCallback(async () => {
    if (!account?.address) return;
    try {
      const userRecord = await fetchUserByWallet(account.address);
      if (userRecord) setUser(userRecord);
    } catch (error) {
      console.error('Failed to refresh user:', error);
    }
  }, [account?.address]);

  const updateProfile = useCallback(async (updates: { username?: string; bio?: string; profile_picture_url?: string }) => {
    if (!user?.wallet_address) throw new Error('No user logged in');
    const updated = await updateUserProfile(user.wallet_address, updates);
    if (updated) setUser(updated);
  }, [user?.wallet_address]);

  const createBusinessProfile = useCallback(async (input: Omit<CreateBusinessInput, 'owner_wallet_address'>) => {
    if (!account?.address) throw new Error('No wallet connected');
    const business = await createBusiness({ ...input, owner_wallet_address: account.address });
    setUserBusiness(business);
  }, [account?.address]);

  const role = user?.role || 'tourist';
  const roleLabel = ROLE_LABELS[role];
  const isCitizen = hasCitizenNFT || user?.is_verified_citizen || false;
  const isBusinessOwner = !!userBusiness;

  const value: UserContextValue = useMemo(() => ({
    user,
    isLoading,
    accountMode,
    setAccountMode,
    userBusiness,
    isBusinessLoading,
    role,
    roleLabel,
    isCitizen,
    isBusinessOwner,
    refreshUser,
    updateProfile,
    createBusinessProfile,
    refreshBusiness,
  }), [user, isLoading, accountMode, setAccountMode, userBusiness, isBusinessLoading, role, roleLabel, isCitizen, isBusinessOwner, refreshUser, updateProfile, createBusinessProfile, refreshBusiness]);

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): UserContextValue {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within UserProvider');
  }
  return context;
}
