// Governance TypeScript Type Definitions

/**
 * ProposalState enum matching OpenZeppelin Governor contract states
 * Values match the uint8 returned from the state() function
 */
export enum ProposalState {
  Pending = 0,
  Active = 1,
  Canceled = 2,
  Defeated = 3,
  Succeeded = 4,
  Queued = 5,
  Expired = 6,
  Executed = 7,
}

/**
 * VoteType enum for casting votes
 * Values match the uint8 support parameter in castVote()
 */
export enum VoteType {
  Against = 0,
  For = 1,
  Abstain = 2,
}

/**
 * Proposal data structure
 * Combines blockchain data with enriched Supabase metadata
 */
export type Proposal = {
  // Core blockchain fields
  proposalId: bigint;
  proposer: string;
  startBlock: bigint;
  endBlock: bigint;
  description: string;
  state: ProposalState;
  forVotes: bigint;
  againstVotes: bigint;
  abstainVotes: bigint;

  // Enriched Supabase fields (optional)
  supabaseId?: string; // UUID proposal_id for routing
  title?: string;
  summary?: string;
  proposalNumber?: number | null;
  category?: string;
  irysContentId?: string;
  irysUrl?: string;
  createdAt?: string;
  blockchainProposalId?: string; // The numeric ID used for blockchain calls
  transactionHash?: string; // Tx hash of the proposal-creation transaction

  // Frozen Gemeinschaftskasse balance captured when the proposal was created
  // (from content.metadata.gemeinschaftskasse_snapshot). Absent → no card.
  gemeinschaftskasseSnapshot?: { euro: number; captured_at: string };

  // Flags
  blockchainUnavailable?: boolean; // True if blockchain data fetch failed
};

/**
 * Vote counts for a proposal
 */
export type ProposalVotes = {
  againstVotes: bigint;
  forVotes: bigint;
  abstainVotes: bigint;
};

/**
 * Vote percentages calculated from vote counts
 */
export type VotePercentages = {
  againstPercent: number;
  forPercent: number;
  abstainPercent: number;
  totalVotes: bigint;
};

/**
 * User's voting status for a proposal
 */
export type UserVoteStatus = {
  hasVoted: boolean;
  support?: VoteType;
};

/**
 * Proposal content from Irys
 * Contains markdown and metadata fetched from permanent storage
 */
export type ProposalContent = {
  title: string | null;
  irysUrl: string | null;
  markdownContent: string | null;
  onchainDescription: string;
  loading: boolean;
  error: string | null;
};

/**
 * Map Supabase proposal data to app Proposal type
 * Converts string bigints to BigInt and adds enriched metadata
 */
import type { SupabaseProposal } from './supabase-proposals';

export function mapSupabaseToProposal(supabaseProposal: SupabaseProposal): Proposal {
  // Frozen Gemeinschaftskasse snapshot rides in content.metadata (jsonb, untyped).
  const snap = supabaseProposal.content?.metadata?.gemeinschaftskasse_snapshot;
  const gemeinschaftskasseSnapshot =
    snap && typeof snap.euro === 'number'
      ? { euro: snap.euro, captured_at: String(snap.captured_at ?? '') }
      : undefined;

  return {
    // Core blockchain fields (converted from string to BigInt)
    proposalId: BigInt(supabaseProposal.blockchain_proposal_id),
    proposer: supabaseProposal.proposer_address,
    startBlock: supabaseProposal.snapshot_block ? BigInt(supabaseProposal.snapshot_block) : 0n,
    endBlock: supabaseProposal.deadline_block ? BigInt(supabaseProposal.deadline_block) : 0n,
    description: supabaseProposal.summary, // Use summary as description
    state: supabaseProposal.state as ProposalState,
    forVotes: BigInt(supabaseProposal.for_votes),
    againstVotes: BigInt(supabaseProposal.against_votes),
    abstainVotes: BigInt(supabaseProposal.abstain_votes),

    // Enriched Supabase fields
    supabaseId: supabaseProposal.proposal_id, // UUID for routing
    title: supabaseProposal.title,
    summary: supabaseProposal.summary,
    proposalNumber: supabaseProposal.proposal_number,
    category: supabaseProposal.category,
    irysContentId: supabaseProposal.irys_content_id,
    irysUrl: supabaseProposal.irys_url,
    createdAt: supabaseProposal.created_at,
    blockchainProposalId: supabaseProposal.blockchain_proposal_id,
    transactionHash: supabaseProposal.transaction_hash,
    gemeinschaftskasseSnapshot,

    // Flags
    blockchainUnavailable: false, // Will be set to true if blockchain fetch fails
  };
}
