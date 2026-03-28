"use client";

import type { Proposal } from "@/lib/proposal-types";
import {
  getProposalStateLabel,
  getProposalStateColor,
  formatAddress,
} from "@/lib/proposal-types";

interface ProposalHeroProps {
  proposal: Proposal;
}

export function ProposalHero({ proposal }: ProposalHeroProps) {
  const stateColors = getProposalStateColor(proposal.state);
  const stateLabel = getProposalStateLabel(proposal.state);

  // Format creation date
  const createdDate = new Date(proposal.created_at).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  // Check if proposal is active (pulsing animation)
  const isActive = proposal.state === 1; // Active state

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-6 md:p-8 mb-6">
      {/* Header with proposal number and state */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <span className="text-sm font-mono text-muted-foreground">
          Proposal #{proposal.proposal_number}
        </span>

        <span
          className={`text-xs px-3 py-1 rounded-full font-medium border ${stateColors.bg} ${stateColors.text} ${stateColors.border}`}
        >
          {stateLabel}
        </span>
      </div>

      {/* Title */}
      <h1 className="text-2xl sm:text-3xl md:text-4xl font-medium text-foreground mb-4">
        {proposal.title}
      </h1>

      {/* Summary */}
      {proposal.summary && (
        <p className="text-muted-foreground mb-4 text-lg">
          {proposal.summary}
        </p>
      )}

      {/* Meta information */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>
          by {formatAddress(proposal.proposer_address)}
        </span>
        <span>•</span>
        <span>{createdDate}</span>
      </div>
    </div>
  );
}
