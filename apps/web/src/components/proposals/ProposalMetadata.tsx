"use client";

import type { Proposal } from "@/lib/proposal-types";
import { formatAddress } from "@/lib/proposal-types";

interface ProposalMetadataProps {
  proposal: Proposal;
}

export function ProposalMetadata({ proposal }: ProposalMetadataProps) {
  return (
    <div className="space-y-4">
      {/* Proposer Card */}
      <div className="bg-card border border-border rounded-xl shadow-sm p-4">
        <div className="text-xs font-medium text-muted-foreground mb-2 tracking-wide">PROPOSER</div>
        <div className="font-mono text-sm text-foreground mb-2">
          {formatAddress(proposal.proposer_address, 8, 6)}
        </div>
        <a
          href={`https://basescan.org/address/${proposal.proposer_address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary hover:text-primary/80 transition-colors"
        >
          View on BaseScan →
        </a>
      </div>

      {/* Storage Card */}
      <div className="bg-card border border-border rounded-xl shadow-sm p-4">
        <div className="text-xs font-medium text-muted-foreground mb-2 tracking-wide">CONTENT STORAGE</div>
        <a
          href={proposal.irys_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-primary hover:text-primary/80 transition-colors block mb-2"
        >
          Irys (Arweave) →
        </a>
        <div className="text-xs text-muted-foreground">
          Permanently stored on-chain
        </div>
      </div>
    </div>
  );
}
