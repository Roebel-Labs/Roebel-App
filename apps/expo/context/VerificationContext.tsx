/**
 * Verification Context
 *
 * Manages NFT status and verification requests for the current user
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useActiveAccount } from 'thirdweb/react';
import { readContract } from 'thirdweb';
import { citizenNFTContract, attesterNFTContract } from '@/constants/verification-contracts';
import { fetchUserRequests } from '@/lib/supabase-verification';
import type { NFTStatus, VerificationRequest } from '@/lib/verification-types';

interface VerificationContextValue {
  // NFT Status
  nftStatus: NFTStatus;
  hasCitizenNFT: boolean;
  hasAttesterNFT: boolean;
  hasAnyNFT: boolean;

  // Requests
  userRequests: any[];
  activePendingRequest: any | null;

  // Actions
  refreshNFTStatus: () => Promise<void>;
  refreshRequests: () => Promise<void>;
  refresh: () => Promise<void>;
}

const VerificationContext = createContext<VerificationContextValue | undefined>(undefined);

export function VerificationProvider({ children }: { children: React.ReactNode }) {
  const account = useActiveAccount();

  const [nftStatus, setNftStatus] = useState<NFTStatus>({
    hasCitizenNFT: false,
    hasAttesterNFT: false,
    isLoading: true,
  });

  const [userRequests, setUserRequests] = useState<any[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);

  // Check NFT status
  const refreshNFTStatus = useCallback(async () => {
    if (!account?.address) {
      setNftStatus({
        hasCitizenNFT: false,
        hasAttesterNFT: false,
        isLoading: false,
      });
      return;
    }

    try {
      setNftStatus(prev => ({ ...prev, isLoading: true }));

      // Check both NFTs in parallel
      const [hasCitizen, hasAttester] = await Promise.all([
        readContract({
          contract: citizenNFTContract,
          method: 'function hasCitizenNFT(address account) view returns (bool)',
          params: [account.address],
        }),
        readContract({
          contract: attesterNFTContract,
          method: 'function hasAttesterNFT(address account) view returns (bool)',
          params: [account.address],
        }),
      ]);

      setNftStatus({
        hasCitizenNFT: hasCitizen,
        hasAttesterNFT: hasAttester,
        isLoading: false,
      });

      console.log('✅ NFT Status:', { hasCitizen, hasAttester });
    } catch (error) {
      console.error('❌ Failed to check NFT status:', error);
      setNftStatus({
        hasCitizenNFT: false,
        hasAttesterNFT: false,
        isLoading: false,
      });
    }
  }, [account?.address]);

  // Fetch user's requests
  const refreshRequests = useCallback(async () => {
    if (!account?.address) {
      setUserRequests([]);
      return;
    }

    try {
      setIsLoadingRequests(true);
      const requests = await fetchUserRequests(account.address);
      setUserRequests(requests);
      console.log(`✅ Fetched ${requests.length} user requests`);
    } catch (error) {
      console.error('❌ Failed to fetch user requests:', error);
      setUserRequests([]);
    } finally {
      setIsLoadingRequests(false);
    }
  }, [account?.address]);

  // Refresh both
  const refresh = useCallback(async () => {
    await Promise.all([refreshNFTStatus(), refreshRequests()]);
  }, [refreshNFTStatus, refreshRequests]);

  // Auto-refresh on mount and account change
  useEffect(() => {
    refresh();
  }, [account?.address]);

  // Find active pending request
  const activePendingRequest = useMemo(() => {
    return userRequests.find(req => req.status === 'pending') || null;
  }, [userRequests]);

  // Derived values
  const hasCitizenNFT = nftStatus.hasCitizenNFT;
  const hasAttesterNFT = nftStatus.hasAttesterNFT;
  const hasAnyNFT = hasCitizenNFT || hasAttesterNFT;

  const value: VerificationContextValue = {
    nftStatus,
    hasCitizenNFT,
    hasAttesterNFT,
    hasAnyNFT,
    userRequests,
    activePendingRequest,
    refreshNFTStatus,
    refreshRequests,
    refresh,
  };

  return (
    <VerificationContext.Provider value={value}>
      {children}
    </VerificationContext.Provider>
  );
}

export function useVerificationContext(): VerificationContextValue {
  const context = useContext(VerificationContext);
  if (!context) {
    throw new Error('useVerificationContext must be used within VerificationProvider');
  }
  return context;
}
