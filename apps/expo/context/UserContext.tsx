import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'expo-router';
import { useActiveAccount, useActiveWallet } from 'thirdweb/react';
import { getUserEmail } from 'thirdweb/wallets/in-app';
import { client } from '@/constants/thirdweb';
import { useVerificationContext } from '@/context/VerificationContext';
import { useConsent } from '@/context/ConsentContext';
import { setSentryUser } from '@/lib/sentry-init';
import { Events, track } from '@/lib/analytics';
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
  const consent = useConsent();

  const [user, setUser] = useState<UserRecord | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const onboardingTriggeredFor = useRef<string | null>(null);
  const sentryIdentifiedFor = useRef<string | null>(null);
  const grandfatherCheckedFor = useRef<string | null>(null);

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
          track(Events.LOGIN_COMPLETED, {
            tier: userRecord.tier,
            is_returning_user: !!userRecord.terms_accepted_at,
            onboarding_completed: !!userRecord.onboarding_completed_at,
          });
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

  // Identify user in Sentry on login (consent-aware via setSentryUser);
  // reset on logout. PostHog identify is handled by <PostHogTelemetry />,
  // which only mounts when analytics consent is granted (so it stays inside
  // the actual <PostHogProvider> and never calls usePostHog without one).
  useEffect(() => {
    if (user?.wallet_address) {
      if (consent.preferences.crash) {
        setSentryUser({ id: user.wallet_address, segment: user.tier });
        sentryIdentifiedFor.current = user.wallet_address;
      }
    } else if (sentryIdentifiedFor.current) {
      setSentryUser(null);
      sentryIdentifiedFor.current = null;
    }
  }, [
    user?.wallet_address,
    user?.tier,
    consent.preferences.crash,
  ]);

  // Reconcile device-level consent record with the wallet once it appears.
  // Apply the grandfather "Accept all" path for users who already accepted
  // terms before the granular consent system existed.
  useEffect(() => {
    if (!user?.wallet_address) return;
    if (!consent.ready) return;
    void consent.reconcileWallet(user.wallet_address);

    if (
      grandfatherCheckedFor.current === user.wallet_address ||
      consent.needsConsent === false
    ) {
      // either we already grandfathered on this wallet, or there's stored
      // consent (handled by the standard flow), or the modal will be shown.
    }

    if (
      consent.needsConsent &&
      user.terms_accepted_at &&
      grandfatherCheckedFor.current !== user.wallet_address
    ) {
      grandfatherCheckedFor.current = user.wallet_address;
      void consent.applyGrandfather();
    }
  }, [user?.wallet_address, user?.terms_accepted_at, consent]);

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
