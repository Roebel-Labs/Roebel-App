"use client";

import { memo } from "react";
import Link from "next/link";
import { Handle, Position } from "reactflow";

import { getBaseScanTxUrl } from "@/lib/blockscout";
import {
  formatAddress,
  getProposalStateColor,
  getProposalStateLabel,
} from "@/lib/proposal-types";
import { de } from "@/lib/translations/de";
import type {
  GovernanceEventKind,
  SerializedGovernanceEvent,
  SerializedProposalRef,
} from "@/lib/governance-events";

const KIND_ICON: Record<GovernanceEventKind, string> = {
  created: "📝",
  vote: "🗳️",
  queued: "⏳",
  executed: "✅",
  canceled: "✖️",
};

const KIND_LABEL: Record<GovernanceEventKind, string> = {
  created: de.governance.eventCreated,
  vote: de.governance.eventVoteCast,
  queued: de.governance.eventQueued,
  executed: de.governance.eventExecuted,
  canceled: de.governance.eventCanceled,
};

export interface ProposalBlockNodeData {
  proposal: SerializedProposalRef | null;
  proposalId: string;
  events: SerializedGovernanceEvent[];
}

function shortHash(hash: string): string {
  if (!hash) return "";
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

function ProposalBlockNodeImpl({ data }: { data: ProposalBlockNodeData }) {
  const { proposal, proposalId, events } = data;
  const stateColors = proposal ? getProposalStateColor(proposal.state) : null;
  const stateLabel = proposal ? getProposalStateLabel(proposal.state) : null;

  const title =
    proposal?.title ??
    `${de.governance.unknownProposal} #${proposalId.slice(0, 8)}…`;

  const detailHref = proposal ? `/proposals/${proposal.proposal_id}` : null;
  const firstBlock = events[0]?.blockNumber;
  const lastBlock = events[events.length - 1]?.blockNumber;

  return (
    <div className="w-[320px] rounded-xl border border-border bg-card shadow-md">
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-0 !bg-muted-foreground/40"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-0 !bg-muted-foreground/40"
      />

      <header className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-mono text-muted-foreground">
              #{proposal?.proposal_number ?? "—"}
            </span>
            {stateColors && stateLabel && (
              <span
                className={`rounded-full border px-2 py-0.5 font-medium ${stateColors.bg} ${stateColors.text} ${stateColors.border}`}
              >
                {stateLabel}
              </span>
            )}
          </div>
          <h3 className="mt-1 line-clamp-2 text-sm font-medium leading-snug text-foreground">
            {title}
          </h3>
        </div>
      </header>

      <div className="px-4 py-3">
        <ul className="flex flex-wrap gap-1.5">
          {events.map((event) => (
            <li key={`${event.txHash}-${event.kind}-${event.blockNumber}`}>
              <a
                href={getBaseScanTxUrl(event.txHash)}
                target="_blank"
                rel="noopener noreferrer"
                title={`${KIND_LABEL[event.kind]} · Block #${event.blockNumber} · ${shortHash(event.txHash)}`}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-1 text-xs leading-none text-foreground transition-colors hover:border-primary hover:text-primary"
              >
                <span aria-hidden>{KIND_ICON[event.kind]}</span>
                <span className="font-mono">
                  {shortHash(event.txHash)}
                </span>
              </a>
            </li>
          ))}
        </ul>

        <dl className="mt-3 grid grid-cols-2 gap-y-1 text-[11px] text-muted-foreground">
          <dt className="font-medium text-foreground">
            {de.governance.block}
          </dt>
          <dd className="text-right font-mono">
            {firstBlock === lastBlock || !lastBlock
              ? `#${firstBlock ?? "—"}`
              : `#${firstBlock} → #${lastBlock}`}
          </dd>
          {proposal?.proposer_address && (
            <>
              <dt className="font-medium text-foreground">
                {de.governance.proposer}
              </dt>
              <dd className="text-right font-mono">
                {formatAddress(proposal.proposer_address)}
              </dd>
            </>
          )}
        </dl>
      </div>

      {detailHref && (
        <footer className="border-t border-border px-4 py-2">
          <Link
            href={detailHref}
            className="text-xs font-medium text-primary hover:underline"
          >
            {de.governance.openProposal} →
          </Link>
        </footer>
      )}
    </div>
  );
}

export const ProposalBlockNode = memo(ProposalBlockNodeImpl);
ProposalBlockNode.displayName = "ProposalBlockNode";
