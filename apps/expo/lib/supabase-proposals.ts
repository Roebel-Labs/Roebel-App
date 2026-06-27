import { supabase } from './supabase';

/**
 * Supabase Proposal Type
 * Matches the 'proposals' table schema in Supabase
 */
export interface SupabaseProposal {
  id: string; // UUID
  proposal_id: string; // UUID (unique key)
  proposal_number: number | null;
  title: string;
  summary: string;
  content: {
    markdown?: string;
    metadata?: any;
  };
  category: string;
  irys_content_id: string;
  irys_url: string;
  transaction_hash: string;
  proposer_address: string;
  block_number: string | null; // Stored as text in Supabase for bigint
  snapshot_block: string | null;
  deadline_block: string | null;
  state: number;
  for_votes: string; // Stored as text for bigint
  against_votes: string;
  abstain_votes: string;
  created_at: string;
  updated_at: string;
  last_synced_at: string | null;
  blockchain_proposal_id: string; // The numeric ID used for blockchain calls
}

/**
 * Fetch all proposals from Supabase
 * Ordered by created_at descending (newest first)
 */
export async function fetchProposals(): Promise<SupabaseProposal[]> {
  try {
    const { data, error } = await supabase
      .from('proposals')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('❌ Supabase error fetching proposals:', error);
      throw new Error(`Failed to fetch proposals: ${error.message}`);
    }

    if (!data) {
      return [];
    }

    return data as SupabaseProposal[];
  } catch (error) {
    console.error('❌ Error in fetchProposals:', error);
    throw error;
  }
}

/**
 * Fetch a single proposal by proposal_id (UUID)
 * This is the primary routing key in the app
 */
export async function fetchProposalById(proposalId: string): Promise<SupabaseProposal> {
  try {
    // Match the routing id flexibly — links/notifications may carry the
    // proposal_id (tx hash), the raw transaction_hash, or the numeric
    // blockchain id. Never use .single(): a 0-row or duplicate result throws
    // the cryptic "JSON object requested, multiple (or no) rows returned".
    const isNumeric = /^[0-9]+$/.test(proposalId);
    const orFilter = isNumeric
      ? `proposal_id.eq.${proposalId},transaction_hash.eq.${proposalId},blockchain_proposal_id.eq.${proposalId}`
      : `proposal_id.eq.${proposalId},transaction_hash.eq.${proposalId}`;

    const { data, error } = await supabase
      .from('proposals')
      .select('*')
      .or(orFilter)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error(`❌ Supabase error fetching proposal ${proposalId}:`, error);
      throw new Error(`Failed to fetch proposal: ${error.message}`);
    }

    if (!data || data.length === 0) {
      throw new Error('Vorschlag nicht gefunden.');
    }

    return data[0] as SupabaseProposal;
  } catch (error) {
    console.error(`❌ Error in fetchProposalById(${proposalId}):`, error);
    throw error;
  }
}

/**
 * Fetch proposal by blockchain_proposal_id (numeric ID used on-chain)
 * Useful for reverse lookup from blockchain events
 */
export async function fetchProposalByBlockchainId(
  blockchainProposalId: string
): Promise<SupabaseProposal | null> {
  try {
    const { data, error } = await supabase
      .from('proposals')
      .select('*')
      .eq('blockchain_proposal_id', blockchainProposalId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error(`❌ Supabase error fetching proposal by blockchain ID ${blockchainProposalId}:`, error);
      throw new Error(`Failed to fetch proposal: ${error.message}`);
    }

    return (data && data.length > 0 ? data[0] : null) as SupabaseProposal | null;
  } catch (error) {
    console.error(`❌ Error in fetchProposalByBlockchainId(${blockchainProposalId}):`, error);
    return null;
  }
}
