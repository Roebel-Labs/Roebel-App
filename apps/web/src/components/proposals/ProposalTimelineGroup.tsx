import Link from "next/link";
import { TimelineEventRow } from "./TimelineEventRow";
import {
  approxTimestampMs,
  type BlockAnchor,
  type ProposalTimelineGroup as TimelineGroup,
} from "@/lib/governance-events";
import { de } from "@/lib/translations/de";
import {
  getProposalStateColor,
  getProposalStateLabel,
} from "@/lib/proposal-types";

interface ProposalTimelineGroupProps {
  group: TimelineGroup;
  anchor: BlockAnchor | null;
}

export function ProposalTimelineGroup({
  group,
  anchor,
}: ProposalTimelineGroupProps) {
  const { proposal, proposalId, events } = group;
  const stateColors = proposal ? getProposalStateColor(proposal.state) : null;
  const stateLabel = proposal ? getProposalStateLabel(proposal.state) : null;

  const title = proposal?.title ?? `${de.governance.unknownProposal} #${proposalId.slice(0, 10)}…`;
  const href = proposal ? `/proposals/${proposal.proposal_id}` : null;

  return (
    <article className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            {proposal && (
              <span className="font-mono text-xs text-muted-foreground">
                #{proposal.proposal_number}
              </span>
            )}
            {stateColors && stateLabel && (
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium border ${stateColors.bg} ${stateColors.text} ${stateColors.border}`}
              >
                {stateLabel}
              </span>
            )}
            <span className="rounded-full border border-border px-2 py-0.5 font-mono text-xs text-muted-foreground">
              ID {proposalId.slice(0, 10)}…
            </span>
          </div>
          {href ? (
            <Link
              href={href}
              className="text-lg font-medium text-foreground hover:underline"
            >
              {title}
            </Link>
          ) : (
            <h3 className="text-lg font-medium text-foreground">{title}</h3>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {events.length} {events.length === 1 ? de.governance.eventSingular : de.governance.eventPlural}
        </span>
      </header>

      <ol className="relative">
        <span
          aria-hidden
          className="absolute left-[1.0625rem] top-0 bottom-0 w-px bg-border"
        />
        {events.map((event) => (
          <TimelineEventRow
            key={`${event.txHash}-${event.kind}-${event.blockNumber}`}
            event={event}
            approxTimestampMs={approxTimestampMs(event.blockNumber, anchor)}
          />
        ))}
      </ol>
    </article>
  );
}
