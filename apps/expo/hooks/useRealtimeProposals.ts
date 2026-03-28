import { useState, useEffect, useCallback, useRef } from 'react';
import { readContract } from 'thirdweb';
import { governorContract } from '@/constants/thirdweb';
import { Proposal, ProposalState } from '@/lib/governance-types';
import { fetchProposals } from '@/lib/supabase-proposals';
import { mapSupabaseToProposal } from '@/lib/governance-types';

const REFRESH_INTERVAL = 10000; // 10 seconds

/**
 * Real-time proposals hook with auto-refresh
 * Fetches metadata from Supabase once, then auto-refreshes vote data from blockchain
 */
export function useRealtimeProposals() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  // Fetch vote data from blockchain for all proposals
  const fetchVoteData = useCallback(async (proposalList: Proposal[]) => {
    const voteDataPromises = proposalList.map(async (proposal) => {
      try {
        const blockchainProposalId = BigInt(proposal.blockchainProposalId!);

        const [stateResult, votesResult] = await Promise.all([
          readContract({
            contract: governorContract,
            method: 'function state(uint256) view returns (uint8)',
            params: [blockchainProposalId],
          }),
          readContract({
            contract: governorContract,
            method: 'function proposalVotes(uint256) view returns (uint256 againstVotes, uint256 forVotes, uint256 abstainVotes)',
            params: [blockchainProposalId],
          }),
        ]);

        return {
          ...proposal,
          state: stateResult as ProposalState,
          againstVotes: votesResult[0],
          forVotes: votesResult[1],
          abstainVotes: votesResult[2],
          blockchainUnavailable: false,
        };
      } catch (err) {
        console.warn(`⚠️ Failed to fetch vote data for proposal ${proposal.proposalId}`, err);
        return {
          ...proposal,
          blockchainUnavailable: true,
        };
      }
    });

    return await Promise.all(voteDataPromises);
  }, []);

  // Initial load: Fetch from Supabase and enrich with blockchain data
  const loadProposals = useCallback(async () => {
    if (!isMountedRef.current) return;

    try {
      setLoading(true);
      setError(null);

      console.log('📋 Fetching proposals from Supabase...');
      const supabaseProposals = await fetchProposals();
      console.log(`✅ Found ${supabaseProposals.length} proposals`);

      if (supabaseProposals.length === 0) {
        if (isMountedRef.current) {
          setProposals([]);
          setLoading(false);
        }
        return;
      }

      const mappedProposals = supabaseProposals.map(mapSupabaseToProposal);
      const enrichedProposals = await fetchVoteData(mappedProposals);

      if (isMountedRef.current) {
        const sortedProposals = enrichedProposals.sort((a, b) => {
          if (a.createdAt && b.createdAt) {
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          }
          return Number(b.proposalId - a.proposalId);
        });

        setProposals(sortedProposals);
        setLoading(false);
      }
    } catch (err) {
      if (isMountedRef.current) {
        console.error('❌ Error loading proposals:', err);
        setError(err instanceof Error ? err.message : 'Fehler beim Laden der Vorschläge');
        setLoading(false);
      }
    }
  }, [fetchVoteData]);

  // Refresh vote data only (keep Supabase metadata)
  const refreshVoteData = useCallback(async () => {
    if (proposals.length === 0 || !isMountedRef.current) return;

    try {
      console.log('🔄 Refreshing vote data...');
      const updatedProposals = await fetchVoteData(proposals);

      if (isMountedRef.current) {
        setProposals(updatedProposals);
      }
    } catch (err) {
      console.warn('⚠️ Failed to refresh vote data:', err);
    }
  }, [proposals, fetchVoteData]);

  // Manual refresh (pull-to-refresh)
  const refresh = useCallback(async () => {
    setRefreshing(true);
    await loadProposals();
    setRefreshing(false);
  }, [loadProposals]);

  // Initial load
  useEffect(() => {
    isMountedRef.current = true;
    loadProposals();

    return () => {
      isMountedRef.current = false;
    };
  }, [loadProposals]);

  // Auto-refresh vote data every 10 seconds
  useEffect(() => {
    if (proposals.length === 0) return;

    intervalRef.current = setInterval(() => {
      refreshVoteData();
    }, REFRESH_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [proposals.length, refreshVoteData]);

  return {
    proposals,
    loading,
    refreshing,
    error,
    refresh,
    refetchVoteData: refreshVoteData,
  };
}
