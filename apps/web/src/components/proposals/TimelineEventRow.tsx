import { getBaseScanTxUrl } from "@/lib/blockscout";
import { formatAddress, formatVotes } from "@/lib/proposal-types";
import { de } from "@/lib/translations/de";
import type { GovernanceEvent, GovernanceEventKind } from "@/lib/governance-events";

interface TimelineEventRowProps {
  event: GovernanceEvent;
  approxTimestampMs: number | null;
}

const KIND_STYLES: Record<
  GovernanceEventKind,
  { dot: string; label: string; icon: string }
> = {
  created: {
    dot: "bg-blue-500",
    label: de.governance.eventCreated,
    icon: "📝",
  },
  vote: {
    dot: "bg-purple-500",
    label: de.governance.eventVoteCast,
    icon: "🗳️",
  },
  queued: {
    dot: "bg-amber-500",
    label: de.governance.eventQueued,
    icon: "⏳",
  },
  executed: {
    dot: "bg-emerald-500",
    label: de.governance.eventExecuted,
    icon: "✅",
  },
  canceled: {
    dot: "bg-red-500",
    label: de.governance.eventCanceled,
    icon: "✖️",
  },
};

function voteSupportLabel(support: number | undefined): string {
  switch (support) {
    case 1:
      return de.governance.voteFor;
    case 0:
      return de.governance.voteAgainst;
    case 2:
      return de.governance.voteAbstain;
    default:
      return "—";
  }
}

function relativeTime(ms: number | null): string {
  if (ms === null) return "";
  const diff = Date.now() - ms;
  if (diff < 0) return "";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${de.governance.relativePrefix} ${minutes} ${de.governance.minutesShort}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${de.governance.relativePrefix} ${hours} ${de.governance.hoursShort}`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${de.governance.relativePrefix} ${days} ${de.governance.daysShort}`;
  const months = Math.floor(days / 30);
  return `${de.governance.relativePrefix} ${months} ${de.governance.monthsShort}`;
}

function shortHash(hash: string): string {
  if (!hash) return "";
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

export function TimelineEventRow({ event, approxTimestampMs }: TimelineEventRowProps) {
  const style = KIND_STYLES[event.kind];

  return (
    <li className="relative pl-10 pb-6 last:pb-0">
      <span
        className={`absolute left-3 top-1.5 h-3 w-3 rounded-full ring-4 ring-background ${style.dot}`}
        aria-hidden
      />
      <div className="rounded-lg border border-border bg-card/60 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex items-center gap-2">
            <span aria-hidden className="text-base leading-none">
              {style.icon}
            </span>
            <span className="text-sm font-medium text-foreground">
              {style.label}
            </span>
            {event.kind === "vote" && (
              <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                {voteSupportLabel(event.support)}
              </span>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {relativeTime(approxTimestampMs)}
          </span>
        </div>

        <div className="mt-2 grid grid-cols-1 gap-1.5 text-xs text-muted-foreground sm:grid-cols-2">
          <div>
            <span className="font-medium text-foreground">
              {de.governance.block}
            </span>{" "}
            <span className="font-mono">#{event.blockNumber.toString()}</span>
          </div>
          {event.kind === "vote" && event.weight && event.weight !== "0" && (
            <div>
              <span className="font-medium text-foreground">
                {de.governance.weight}
              </span>{" "}
              <span className="font-mono">{formatVotes(event.weight)}</span>
            </div>
          )}
          {event.kind === "vote" && event.voter && (
            <div className="sm:col-span-2">
              <span className="font-medium text-foreground">
                {de.governance.voter}
              </span>{" "}
              <span className="font-mono">{formatAddress(event.voter)}</span>
            </div>
          )}
          {event.kind === "created" && event.proposer && (
            <div className="sm:col-span-2">
              <span className="font-medium text-foreground">
                {de.governance.proposer}
              </span>{" "}
              <span className="font-mono">{formatAddress(event.proposer)}</span>
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">
            {shortHash(event.txHash)}
          </span>
          <a
            href={getBaseScanTxUrl(event.txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            {de.governance.verifyOnBasescan}
            <span aria-hidden>↗</span>
          </a>
        </div>
      </div>
    </li>
  );
}
