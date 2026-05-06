"use client";

import Link from "next/link";
import {
  getProposalStateLabel,
  getProposalStateColor,
  formatVotes,
} from "@/lib/proposal-types";
import type { ProposalPreviewRef } from "@/types/post";

interface ProposalPreviewCardProps {
  proposal: ProposalPreviewRef;
}

export function ProposalPreviewCard({ proposal }: ProposalPreviewCardProps) {
  const stateColors = getProposalStateColor(proposal.state);
  const stateLabel = getProposalStateLabel(proposal.state);

  const forVotes = BigInt(proposal.for_votes || "0");
  const againstVotes = BigInt(proposal.against_votes || "0");
  const abstainVotes = BigInt(proposal.abstain_votes || "0");
  const totalVotes = forVotes + againstVotes + abstainVotes;

  const pct = (n: bigint) =>
    totalVotes === 0n ? 0 : Number((n * 1000n) / totalVotes) / 10;

  return (
    <Link
      href={`/app/proposals/${proposal.proposal_id}`}
      className="block rounded-md border border-border bg-muted/40 p-3 hover:bg-accent transition-colors"
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
          Vorschlag{proposal.proposal_number !== null ? ` #${proposal.proposal_number}` : ""}
        </span>
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${stateColors.bg} ${stateColors.text} ${stateColors.border}`}
        >
          {stateLabel}
        </span>
      </div>
      <p className="text-sm font-semibold text-foreground line-clamp-2 mb-2">
        {proposal.title}
      </p>
      {totalVotes > 0n ? (
        <div className="flex h-1.5 rounded-full overflow-hidden bg-muted">
          <div className="bg-green-500" style={{ width: `${pct(forVotes)}%` }} />
          <div className="bg-red-500" style={{ width: `${pct(againstVotes)}%` }} />
          <div className="bg-muted-foreground/40" style={{ width: `${pct(abstainVotes)}%` }} />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Noch keine Stimmen</p>
      )}
      {totalVotes > 0n && (
        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
          <span className="text-green-600 font-medium">{formatVotes(proposal.for_votes)}</span>
          <span className="text-red-600 font-medium">{formatVotes(proposal.against_votes)}</span>
          <span>{formatVotes(proposal.abstain_votes)}</span>
        </div>
      )}
    </Link>
  );
}
