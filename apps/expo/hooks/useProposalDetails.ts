import { useState, useEffect } from 'react';
import { readContract } from 'thirdweb';
import { governorContract } from '@/constants/thirdweb';
import { Proposal, ProposalState, UserVoteStatus, mapSupabaseToProposal } from '@/lib/governance-types';
import { fetchProposalById } from '@/lib/supabase-proposals';

interface ProposalDetailsResult {
  proposal: Proposal | null;
  userVoteStatus: UserVoteStatus | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Custom hook to fetch detailed information about a specific proposal
 * Fetches from Supabase and enriches with real-time blockchain data
 * @param proposalId - The UUID proposal_id from Supabase
 * @param userAddress - The address of the current user (optional)
 */
export function useProposalDetails(
  proposalId: string | null,
  userAddress?: string
): ProposalDetailsResult {
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [userVoteStatus, setUserVoteStatus] = useState<UserVoteStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  useEffect(() => {
    let isCancelled = false;

    async function fetchProposalDetails() {
      if (!proposalId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Step 1: Fetch proposal from Supabase by UUID
        console.log(`📖 Loading proposal ${proposalId} from Supabase...`);
        const supabaseProposal = await fetchProposalById(proposalId);
        console.log(`✅ Found proposal: ${supabaseProposal.title}`);

        // Step 2: Map to app Proposal type
        const mappedProposal = mapSupabaseToProposal(supabaseProposal);

        // Step 3: Enrich with real-time blockchain data
        const blockchainProposalId = BigInt(supabaseProposal.blockchain_proposal_id);

        let enrichedProposal: Proposal;
        try {
          console.log('🔄 Fetching real-time blockchain data...');
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

          enrichedProposal = {
            ...mappedProposal,
            state: stateResult as ProposalState,
            againstVotes: votesResult[0],
            forVotes: votesResult[1],
            abstainVotes: votesResult[2],
            blockchainUnavailable: false,
          };

          console.log('✅ Real-time blockchain data loaded');
        } catch (blockchainError) {
          // Blockchain fetch failed - use cached Supabase data
          console.warn('⚠️ Blockchain RPC unavailable, using cached data from Supabase');
          enrichedProposal = {
            ...mappedProposal,
            blockchainUnavailable: true,
          };
        }

        // Step 4: Fetch user vote status if user address is provided
        let voteStatus: UserVoteStatus | null = null;
        if (userAddress) {
          try {
            const hasVotedResult = await readContract({
              contract: governorContract,
              method: 'function hasVoted(uint256 proposalId, address account) view returns (bool)',
              params: [blockchainProposalId, userAddress],
            });

            voteStatus = {
              hasVoted: hasVotedResult,
            };
          } catch (voteError) {
            console.warn('⚠️ Failed to check vote status:', voteError);
            voteStatus = { hasVoted: false };
          }
        }

        if (!isCancelled) {
          setProposal(enrichedProposal);
          setUserVoteStatus(voteStatus);
          setLoading(false);
        }
      } catch (err) {
        if (!isCancelled) {
          console.error('Error fetching proposal details:', err);
          setError(err instanceof Error ? err.message : 'Failed to fetch proposal');
          setLoading(false);
        }
      }
    }

    fetchProposalDetails();

    return () => {
      isCancelled = true;
    };
  }, [proposalId, userAddress, refetchTrigger]);

  const refetch = () => {
    setRefetchTrigger((prev) => prev + 1);
  };

  return { proposal, userVoteStatus, loading, error, refetch };
}
