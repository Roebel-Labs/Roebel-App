import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'expo-router';
import { useActiveAccount, useActiveWallet } from 'thirdweb/react';
import { getUserEmail } from 'thirdweb/wallets/in-app';
import { usePostHog } from 'posthog-react-native';
import * as Sentry from '@sentry/react-native';
import { client } from '@/constants/thirdweb';
import { useVerificationContext } from '@/context/VerificationContext';
import { upsertUser, updateUserProfile, updateUserTier, fetchUserByWallet } from '@/lib/supabase-users';
import type { UserRecord, UserTier } from '@/lib/types';

const TIER_LABELS: Record<UserTier, string> = {
  guest: 'Gast',
  tourist: 'Tourist',
  citizen: 'Bürger',
};

interface UserContextValue {
  user: UserRecord | null;
  isLoading: boolean;

  tier: UserTier;
  tierLabel: string;
  isCitizen: boolean;
  isConnected: boolean;

  refreshUser: () => Promise<void>;
  updateProfile: (updates: {
    username?: string;
    bio?: string;
    profile_picture_url?: string;
    cover_image_url?: string;
    neighborhood?: string;
    interests?: string[];
  }) => Promise<void>;
}

const UserContext = createContext<UserContextValue | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const account = useActiveAccount();
  const wallet = useActiveWallet();
  const router = useRouter();
  const { hasCitizenNFT } = useVerificationContext();
  const posthog = usePostHog();

  const [user, setUser] = useState<UserRecord | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const onboardingTriggeredFor = useRef<string | null>(null);
  const identifiedFor = useRef<string | null>(null);

  // Sync user on login/account change
  useEffect(() => {
    if (!account?.address) {
      setUser(null);
      onboardingTriggeredFor.current = null;
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

        // Onboarding + consent re-prompt trigger — fires once per connection transition
        if (userRecord && onboardingTriggeredFor.current !== userRecord.wallet_address) {
          onboardingTriggeredFor.current = userRecord.wallet_address;
          if (!userRecord.onboarding_completed_at) {
            setTimeout(() => router.push('/welcome' as any), 150);
          } else if (!userRecord.terms_accepted_at) {
            setTimeout(() => router.push('/welcome/consent' as any), 150);
          }
        }
      } catch (error) {
        console.error('Failed to sync user:', error);
      } finally {
        setIsLoading(false);
      }
    }

    syncUser();
  }, [account?.address, wallet, router]);

  // Identify user in PostHog + Sentry on login; reset on logout
  useEffect(() => {
    if (user?.wallet_address) {
      const props = {
        tier: user.tier,
        onboarding_completed: !!user.onboarding_completed_at,
        is_verified_citizen: !!user.is_verified_citizen,
      };
      if (identifiedFor.current !== user.wallet_address) {
        posthog?.identify(user.wallet_address, props);
        identifiedFor.current = user.wallet_address;
      } else {
        posthog?.capture('$set', { $set: props });
      }
      Sentry.setUser({ id: user.wallet_address, segment: user.tier });
    } else if (identifiedFor.current) {
      posthog?.reset();
      Sentry.setUser(null);
      identifiedFor.current = null;
    }
  }, [user?.wallet_address, user?.tier, user?.onboarding_completed_at, user?.is_verified_citizen, posthog]);

  // Auto-upgrade tier when citizen NFT is detected
  useEffect(() => {
    if (user && hasCitizenNFT && user.tier !== 'citizen') {
      updateUserTier(user.wallet_address, 'citizen', true)
        .then(() => {
          setUser(prev =>
            prev ? { ...prev, tier: 'citizen' as const, is_verified_citizen: true, verification_status: 'approved' as const } : null
          );
        })
        .catch(err => console.error('Failed to upgrade tier:', err));
    }
    // Auto-downgrade if NFT lost
    if (user && !hasCitizenNFT && user.tier === 'citizen' && user.is_verified_citizen) {
      updateUserTier(user.wallet_address, 'tourist', false)
        .then(() => {
          setUser(prev =>
            prev ? { ...prev, tier: 'tourist' as const, is_verified_citizen: false } : null
          );
        })
        .catch(err => console.error('Failed to downgrade tier:', err));
    }
  }, [hasCitizenNFT, user?.tier, user?.wallet_address, user?.is_verified_citizen]);

  const refreshUser = useCallback(async () => {
    if (!account?.address) return;
    try {
      const userRecord = await fetchUserByWallet(account.address);
      if (userRecord) setUser(userRecord);
    } catch (error) {
      console.error('Failed to refresh user:', error);
    }
  }, [account?.address]);

  const updateProfile = useCallback(async (updates: {
    username?: string;
    bio?: string;
    profile_picture_url?: string;
    cover_image_url?: string;
    neighborhood?: string;
    interests?: string[];
  }) => {
    if (!user?.wallet_address) throw new Error('No user logged in');
    const updated = await updateUserProfile(user.wallet_address, updates);
    if (updated) setUser(updated);
  }, [user?.wallet_address]);

  const tier: UserTier = user?.tier || (account?.address ? 'tourist' : 'guest');
  const tierLabel = TIER_LABELS[tier];
  const isCitizen = hasCitizenNFT || user?.is_verified_citizen || false;
  const isConnected = !!account?.address;

  const value: UserContextValue = useMemo(() => ({
    user,
    isLoading,
    tier,
    tierLabel,
    isCitizen,
    isConnected,
    refreshUser,
    updateProfile,
  }), [user, isLoading, tier, tierLabel, isCitizen, isConnected, refreshUser, updateProfile]);

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
