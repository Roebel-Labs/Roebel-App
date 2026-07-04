import { useState, useEffect } from 'react';
import { readContract } from 'thirdweb';
import { governorContract } from '@/constants/thirdweb';
import { Proposal, ProposalState, mapSupabaseToProposal } from '@/lib/governance-types';
import { fetchProposals } from '@/lib/supabase-proposals';

/**
 * Custom hook to fetch all proposals from Supabase
 * Enriches with real-time blockchain data when available
 * Gracefully falls back to cached Supabase data if blockchain unavailable
 */
export function useProposals() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadProposals() {
      try {
        setLoading(true);
        setError(null);

        // Step 1: Fetch all proposals from Supabase
        console.log('📋 Fetching proposals from Supabase...');
        const supabaseProposals = await fetchProposals();
        console.log(`✅ Found ${supabaseProposals.length} proposals in database`);

        if (supabaseProposals.length === 0) {
          if (!isCancelled) {
            setProposals([]);
            setLoading(false);
          }
          return;
        }

        // Step 2: Map Supabase data to app Proposal type
        const mappedProposals = supabaseProposals.map(mapSupabaseToProposal);

        // Step 3: Enrich with real-time blockchain data
        console.log('🔄 Enriching with blockchain data...');
        const enrichedProposalsPromises = mappedProposals.map(async (proposal) => {
          try {
            // Fetch current state from blockchain. Never call proposalVotes()
            // — the MACI governor has no public vote counting (ballots are
            // encrypted), so it always reverts and would drag the working
            // state() read into the catch branch. Vote counts come from the
            // Supabase row (synced from the Tally contract after publication).
            const blockchainProposalId = BigInt(proposal.blockchainProposalId!);

            const stateResult = await readContract({
              contract: governorContract,
              method: 'function state(uint256) view returns (uint8)',
              params: [blockchainProposalId],
            });

            // Return proposal with live blockchain state
            return {
              ...proposal,
              state: stateResult as ProposalState,
              blockchainUnavailable: false,
            };
          } catch (blockchainError) {
            // Blockchain fetch failed - use cached Supabase data
            console.warn(
              `⚠️ Blockchain unavailable for proposal #${proposal.proposalNumber || proposal.proposalId.toString()}, using cached data`
            );

            return {
              ...proposal,
              blockchainUnavailable: true,
            };
          }
        });

        const enrichedProposals = await Promise.all(enrichedProposalsPromises);

        if (!isCancelled) {
          // Sort by created date or proposal number (newest first)
          const sortedProposals = enrichedProposals.sort((a, b) => {
            if (a.createdAt && b.createdAt) {
              return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            }
            return Number(b.proposalId - a.proposalId);
          });

          setProposals(sortedProposals);
          setLoading(false);

          const liveCount = enrichedProposals.filter((p) => !p.blockchainUnavailable).length;
          const cachedCount = enrichedProposals.length - liveCount;

          console.log(`✅ Loaded ${enrichedProposals.length} proposals (${liveCount} live, ${cachedCount} cached)`);
        }
      } catch (err) {
        if (!isCancelled) {
          console.error('❌ Error loading proposals:', err);
          setError(err instanceof Error ? err.message : 'Failed to load proposals from database');
          setLoading(false);
        }
      }
    }

    loadProposals();

    return () => {
      isCancelled = true;
    };
  }, []);

  return { proposals, loading, error };
}
