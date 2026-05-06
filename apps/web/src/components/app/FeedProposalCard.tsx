"use client";

import Link from "next/link";
import { Vote, ArrowRight } from "lucide-react";
import {
  getProposalStateLabel,
  getProposalStateColor,
  formatVotes,
  formatAddress,
} from "@/lib/proposal-types";
import type { ProposalFeedItem } from "@/types/post";

interface FeedProposalCardProps {
  proposal: ProposalFeedItem;
}

export function FeedProposalCard({ proposal }: FeedProposalCardProps) {
  const stateColors = getProposalStateColor(proposal.state);
  const stateLabel = getProposalStateLabel(proposal.state);

  const forVotes = BigInt(proposal.for_votes || "0");
  const againstVotes = BigInt(proposal.against_votes || "0");
  const abstainVotes = BigInt(proposal.abstain_votes || "0");
  const totalVotes = forVotes + againstVotes + abstainVotes;

  const pct = (n: bigint) =>
    totalVotes === 0n ? 0 : Number((n * 1000n) / totalVotes) / 10;

  const createdDate = new Date(proposal.created_at).toLocaleDateString("de-DE", {
    day: "numeric",
    month: "short",
  });

  return (
    <Link
      href={`/app/proposals/${proposal.proposal_id}`}
      className="block bg-card rounded-lg border border-border p-4 hover:bg-accent/40 transition-colors"
    >
      <div className="flex items-center gap-2 mb-2">
        <Vote className="h-4 w-4 text-primary" />
        <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
          Vorschlag{proposal.proposal_number !== null ? ` #${proposal.proposal_number}` : ""}
        </span>
        <span
          className={`ml-auto text-[10px] px-2 py-0.5 rounded-full font-medium border ${stateColors.bg} ${stateColors.text} ${stateColors.border}`}
        >
          {stateLabel}
        </span>
      </div>

      <h3 className="text-base font-semibold text-foreground line-clamp-2 mb-1">
        {proposal.title}
      </h3>

      {proposal.summary && (
        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
          {proposal.summary}
        </p>
      )}

      {totalVotes > 0n ? (
        <>
          <div className="flex h-2 rounded-full overflow-hidden bg-muted mb-2">
            <div className="bg-green-500" style={{ width: `${pct(forVotes)}%` }} />
            <div className="bg-red-500" style={{ width: `${pct(againstVotes)}%` }} />
            <div className="bg-muted-foreground/40" style={{ width: `${pct(abstainVotes)}%` }} />
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="text-green-600 font-medium">
              Dafür {formatVotes(proposal.for_votes)}
            </span>
            <span className="text-red-600 font-medium">
              Dagegen {formatVotes(proposal.against_votes)}
            </span>
            <span>Enthaltung {formatVotes(proposal.abstain_votes)}</span>
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">Noch keine Stimmen</p>
      )}

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
        <span>
          von {formatAddress(proposal.proposer_address)} · {createdDate}
        </span>
        <span className="flex items-center gap-1 text-primary font-medium">
          Zum Vorschlag <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </Link>
  );
}
