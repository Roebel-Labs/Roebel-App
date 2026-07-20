/**
 * Verification Context
 *
 * Manages NFT status and verification requests for the current user
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useActiveAccount } from 'thirdweb/react';
import { readContract } from 'thirdweb';
import { citizenNFTReadContract, attesterNFTReadContract } from '@/constants/verification-contracts';
import { fetchUserRequests } from '@/lib/supabase-verification';
import { loadCachedVerification, saveCachedVerification, clearCachedVerification } from '@/lib/verification-cache';
import { useWalletBoot } from '@/context/WalletBootContext';
import type { NFTStatus } from '@/lib/verification-types';

// userRequests holds raw `request_evidence` rows straight from Supabase
// (fetchUserRequests) — snake_case fields (nft_type, attester_signatures,
// status: 'pending'|'approved'|'rejected', ...), NOT the camelCase on-chain
// VerificationRequest shape. Every consumer (VerificationBanner, profile.tsx,
// my-request.tsx) reads the snake_case fields, so we type it loosely here
// rather than asserting an incorrect shape.
type RequestRecord = Record<string, any>;

interface VerificationContextValue {
  // NFT Status
  nftStatus: NFTStatus;
  hasCitizenNFT: boolean;
  hasAttesterNFT: boolean;
  hasAnyNFT: boolean;
  // True only once a real on-chain read for the CURRENT address has
  // completed successfully — never true for cached/optimistic values.
  // Consumers (e.g. UserContext's tier auto-downgrade) use this to tell
  // "we haven't checked yet / showing cached data" apart from "confirmed
  // on-chain" before acting on a negative signal.
  chainResolved: boolean;

  // Requests
  userRequests: RequestRecord[];
  activePendingRequest: RequestRecord | null;

  // Actions
  refreshNFTStatus: () => Promise<void>;
  refreshRequests: () => Promise<void>;
  refresh: () => Promise<void>;
}

const VerificationContext = createContext<VerificationContextValue | undefined>(undefined);

export function VerificationProvider({ children }: { children: React.ReactNode }) {
  const account = useActiveAccount();
  const { autoConnectFinished } = useWalletBoot();

  const [nftStatus, setNftStatus] = useState<NFTStatus>({
    hasCitizenNFT: false,
    hasAttesterNFT: false,
    isLoading: true,
  });

  const [userRequests, setUserRequests] = useState<RequestRecord[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [chainResolved, setChainResolved] = useState(false);

  // Mirrors used inside async callbacks / effects so we always read the
  // latest value instead of a stale closure (deps arrays here are kept
  // narrow on purpose to match the existing effect shapes).
  const chainResolvedRef = useRef(false);
  const userRequestsRef = useRef<RequestRecord[]>([]);
  const nftStatusRef = useRef<NFTStatus>(nftStatus);
  const latestAddressRef = useRef<string | undefined>(account?.address);
  // The wallet address the currently-hydrated cache belongs to (if any).
  const cachedWalletRef = useRef<string | null>(null);

  useEffect(() => {
    latestAddressRef.current = account?.address;
  }, [account?.address]);

  // Optimistic hydration: restore the last-resolved verification flags +
  // requests from local storage on mount so citizen-gated UI (tabs, tier,
  // posting, proposals) renders immediately, before thirdweb finishes
  // reconnecting the wallet and the two on-chain reads resolve. Guarded by
  // chainResolvedRef (not isLoading) so a real read that resolves BEFORE this
  // AsyncStorage read finishes — e.g. on a fast network — is never clobbered
  // by a slower-arriving stale cache. Also guarded against a wallet mismatch
  // in case the real address has already resolved by the time this lands.
  // Does NOT set chainResolved — the cached value is optimistic, not confirmed.
  useEffect(() => {
    let cancelled = false;
    loadCachedVerification().then((cached) => {
      if (cancelled || !cached) return;
      cachedWalletRef.current = cached.walletAddress;

      const currentAddress = latestAddressRef.current;
      if (currentAddress && cached.walletAddress.toLowerCase() !== currentAddress.toLowerCase()) {
        // The real wallet is already known and it's not the one this cache
        // belongs to (shared device / wallet switch) — never apply it.
        return;
      }

      if (chainResolvedRef.current) return; // a real read already landed first

      setNftStatus({
        hasCitizenNFT: cached.hasCitizenNFT,
        hasAttesterNFT: cached.hasAttesterNFT,
        isLoading: false,
      });
      setUserRequests(cached.userRequests);
      userRequestsRef.current = cached.userRequests;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Wallet-mismatch safety: once the real address resolves and differs from
  // the wallet the hydrated cache belongs to, reset immediately (before the
  // real read lands) so a previous wallet's cached citizen status never
  // leaks onto a different, freshly-connected wallet on a shared device.
  useEffect(() => {
    if (!account?.address) return;
    const cachedWallet = cachedWalletRef.current;
    if (cachedWallet && cachedWallet.toLowerCase() !== account.address.toLowerCase()) {
      chainResolvedRef.current = false;
      setChainResolved(false);
      setNftStatus({ hasCitizenNFT: false, hasAttesterNFT: false, isLoading: true });
      nftStatusRef.current = { hasCitizenNFT: false, hasAttesterNFT: false, isLoading: true };
      setUserRequests([]);
      userRequestsRef.current = [];
    }
  }, [account?.address]);

  // Check NFT status
  const refreshNFTStatus = useCallback(async () => {
    const address = account?.address;
    if (!address) {
      setNftStatus({
        hasCitizenNFT: false,
        hasAttesterNFT: false,
        isLoading: false,
      });
      return;
    }

    try {
      setNftStatus(prev => ({ ...prev, isLoading: true }));

      // Check both NFTs in parallel — pinned to the public Gnosis RPC
      // (gnosisRead) rather than the hosted thirdweb RPC, which is
      // intermittently rate-limited on preview builds; the same handle MACI
      // event scans already use for reliability.
      const [hasCitizen, hasAttester] = await Promise.all([
        readContract({
          contract: citizenNFTReadContract,
          method: 'function hasCitizenNFT(address account) view returns (bool)',
          params: [address],
        }),
        readContract({
          contract: attesterNFTReadContract,
          method: 'function hasAttesterNFT(address account) view returns (bool)',
          params: [address],
        }),
      ]);

      // Stale-promise guard: the wallet may have switched or logged out while
      // this read was in flight. A resolve-after-switch must not redisplay or
      // persist this read's result — the new (or cleared) wallet owns
      // nftStatus/chainResolved/the cache now.
      if (latestAddressRef.current?.toLowerCase() !== address.toLowerCase()) return;

      const resolved: NFTStatus = {
        hasCitizenNFT: hasCitizen,
        hasAttesterNFT: hasAttester,
        isLoading: false,
      };
      setNftStatus(resolved);
      nftStatusRef.current = resolved;

      chainResolvedRef.current = true;
      setChainResolved(true);

      void saveCachedVerification({
        walletAddress: address,
        hasCitizenNFT: hasCitizen,
        hasAttesterNFT: hasAttester,
        userRequests: userRequestsRef.current,
        savedAt: Date.now(),
      });

      console.log('✅ NFT Status:', { hasCitizen, hasAttester });
    } catch (error) {
      console.error('❌ Failed to check NFT status:', error);

      // Same stale-promise guard for the failure path — this belongs to a
      // wallet that's no longer live; leave its (now-irrelevant) state alone.
      if (latestAddressRef.current?.toLowerCase() !== address.toLowerCase()) return;

      // A failed read is UNCONFIRMED, not a confirmed "no NFT". Keep the
      // last-known flags (prev-guard: never overwrite with false on error)
      // and only flip isLoading off, and close the downgrade gate
      // (chainResolved -> false) until a read actually succeeds again.
      // Without this, a transient RPC hiccup on any later refresh (pull-to-
      // refresh on profile, post-mint refresh, etc. all re-invoke this) would
      // flip hasCitizenNFT to false while chainResolved stayed true from an
      // earlier successful read, and UserContext's downgrade gate would fire
      // a real DB write against a still-valid citizen.
      setNftStatus(prev => ({ ...prev, isLoading: false }));
      nftStatusRef.current = { ...nftStatusRef.current, isLoading: false };
      chainResolvedRef.current = false;
      setChainResolved(false);
    }
  }, [account?.address]);

  // Fetch user's requests
  const refreshRequests = useCallback(async () => {
    const address = account?.address;
    if (!address) {
      setUserRequests([]);
      userRequestsRef.current = [];
      return;
    }

    try {
      setIsLoadingRequests(true);
      const requests = await fetchUserRequests(address);

      // Stale-promise guard: bail if the wallet switched/logged out while
      // this fetch was in flight — never redisplay or persist a different
      // (no-longer-live) wallet's requests.
      if (latestAddressRef.current?.toLowerCase() !== address.toLowerCase()) return;

      setUserRequests(requests);
      userRequestsRef.current = requests;
      console.log(`✅ Fetched ${requests.length} user requests`);

      // Persist the combined bundle too, using the latest known NFT flags.
      // Gated on chainResolvedRef so we never overwrite a good cached NFT
      // reading with the placeholder false/false that nftStatus starts at
      // before the on-chain read for this address has actually landed.
      if (chainResolvedRef.current) {
        void saveCachedVerification({
          walletAddress: address,
          hasCitizenNFT: nftStatusRef.current.hasCitizenNFT,
          hasAttesterNFT: nftStatusRef.current.hasAttesterNFT,
          userRequests: requests,
          savedAt: Date.now(),
        });
      }
    } catch (error) {
      console.error('❌ Failed to fetch user requests:', error);
      if (latestAddressRef.current?.toLowerCase() !== address.toLowerCase()) return;
      setUserRequests([]);
      userRequestsRef.current = [];
    } finally {
      if (latestAddressRef.current?.toLowerCase() === address.toLowerCase()) {
        setIsLoadingRequests(false);
      }
    }
  }, [account?.address]);

  // Refresh both
  const refresh = useCallback(async () => {
    await Promise.all([refreshNFTStatus(), refreshRequests()]);
  }, [refreshNFTStatus, refreshRequests]);

  // Auto-refresh on mount and account change. Skip while auto-connect is
  // still restoring a session: account?.address is transiently undefined on
  // every cold start before the reconnect resolves, and calling refresh()
  // here would reset hasCitizenNFT to false over the optimistically-hydrated
  // cached value. Once autoConnectFinished is true, "no address" really does
  // mean logged out and refresh() correctly clears state (the dedicated
  // logout effect below also clears the persisted cache).
  useEffect(() => {
    if (!account?.address && !autoConnectFinished) return;
    refresh();
  }, [account?.address, autoConnectFinished]);

  // Logout: auto-connect finished and there's no account — a genuine
  // disconnect, not just the reconnect-in-progress window. Reset in-memory
  // state and clear the persisted cache so it never leaks to the next wallet.
  useEffect(() => {
    if (autoConnectFinished && !account?.address) {
      chainResolvedRef.current = false;
      setChainResolved(false);
      setNftStatus({ hasCitizenNFT: false, hasAttesterNFT: false, isLoading: false });
      nftStatusRef.current = { hasCitizenNFT: false, hasAttesterNFT: false, isLoading: false };
      setUserRequests([]);
      userRequestsRef.current = [];
      cachedWalletRef.current = null;
      void clearCachedVerification();
    }
  }, [autoConnectFinished, account?.address]);

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
    chainResolved,
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
