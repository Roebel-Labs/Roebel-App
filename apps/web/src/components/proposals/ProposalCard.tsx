"use client";

import Link from "next/link";
import type { Proposal } from "@/lib/proposal-types";
import {
  getProposalStateLabel,
  getProposalStateColor,
  formatAddress,
  formatVotes,
} from "@/lib/proposal-types";

interface ProposalCardProps {
  proposal: Proposal;
  basePath?: string;
}

export function ProposalCard({ proposal, basePath = "/proposals" }: ProposalCardProps) {
  const stateColors = getProposalStateColor(proposal.state);
  const stateLabel = getProposalStateLabel(proposal.state);

  // Calculate total votes
  const totalVotes =
    BigInt(proposal.for_votes) +
    BigInt(proposal.against_votes) +
    BigInt(proposal.abstain_votes);

  // Format date
  const createdDate = new Date(proposal.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <Link
      href={`${basePath}/${proposal.proposal_id}`}
      className="block bg-card border border-border rounded-lg p-5 hover:border-border hover:shadow-md transition-all"
    >
      <div className="flex justify-between items-start gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-mono text-muted-foreground">
              #{proposal.proposal_number}
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium border ${stateColors.bg} ${stateColors.text} ${stateColors.border}`}
            >
              {stateLabel}
            </span>
          </div>
          <h3 className="font-medium text-lg mb-2 truncate text-foreground">{proposal.title}</h3>
          <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{proposal.summary}</p>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>by {formatAddress(proposal.proposer_address)}</span>
            <span>•</span>
            <span>{createdDate}</span>
            {proposal.category && proposal.category !== "general" && (
              <>
                <span>•</span>
                <span className="capitalize">{proposal.category}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {totalVotes > 0n && (
        <div className="flex gap-4 text-sm mt-4 pt-4 border-t border-border">
          <div className="flex items-center gap-1.5">
            <span className="text-green-600">For:</span>
            <span className="font-mono text-foreground font-medium">
              {formatVotes(proposal.for_votes)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-red-600">Against:</span>
            <span className="font-mono text-foreground font-medium">
              {formatVotes(proposal.against_votes)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Abstain:</span>
            <span className="font-mono text-foreground font-medium">
              {formatVotes(proposal.abstain_votes)}
            </span>
          </div>
        </div>
      )}

      {proposal.content.metadata?.estimatedReadTime && (
        <div className="mt-3 text-xs text-muted-foreground">
          {proposal.content.metadata.estimatedReadTime} min read
        </div>
      )}
    </Link>
  );
}
