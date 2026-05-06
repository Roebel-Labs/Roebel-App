"use server"

import { createClient } from "@/lib/supabase/server"
import type { ProposalFeedItem } from "@/types/post"

export async function fetchProposalsForFeed(
  limit = 20
): Promise<ProposalFeedItem[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("proposals")
    .select(
      "id, proposal_id, proposal_number, title, summary, category, state, for_votes, against_votes, abstain_votes, proposer_address, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    console.error("Error fetching proposals for feed:", error)
    return []
  }

  return ((data || []) as ProposalFeedItem[]).map((p) => ({
    id: p.id,
    proposal_id: p.proposal_id,
    proposal_number: p.proposal_number,
    title: p.title,
    summary: p.summary,
    category: p.category,
    state: p.state,
    for_votes: p.for_votes,
    against_votes: p.against_votes,
    abstain_votes: p.abstain_votes,
    proposer_address: p.proposer_address,
    created_at: p.created_at,
  }))
}
