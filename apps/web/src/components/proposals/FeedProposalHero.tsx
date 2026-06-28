import Link from "next/link";
import Image from "next/image";
import { ProposalState, formatAddress, type Proposal } from "@/lib/proposal-types";

const ILLUSTRATION = "/illustration/buergerumfragen-cropped.png";

/** "12. Jun" — matches the Expo hero's German short date. */
function formatDateDE(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}. ${d.toLocaleDateString("de-DE", { month: "short" })}`;
}

function pct(part: bigint, total: bigint): number {
  if (total === 0n) return 0;
  return Number((part * 10000n) / total) / 100;
}

function VotingBars({
  forVotes,
  againstVotes,
  abstainVotes,
}: {
  forVotes: bigint;
  againstVotes: bigint;
  abstainVotes: bigint;
}) {
  const total = forVotes + againstVotes + abstainVotes;
  const forPct = pct(forVotes, total);
  const againstPct = pct(againstVotes, total);
  const abstainPct = pct(abstainVotes, total);

  return (
    <div className="space-y-1.5">
      <div className="flex h-2 overflow-hidden rounded-full border border-border">
        {total === 0n ? (
          <div className="flex-1 bg-border" />
        ) : (
          <>
            {forPct > 0 && (
              <div style={{ flexGrow: forPct }} className="bg-emerald-500" />
            )}
            {againstPct > 0 && (
              <div style={{ flexGrow: againstPct }} className="bg-red-500" />
            )}
            {abstainPct > 0 && (
              <div style={{ flexGrow: abstainPct }} className="bg-muted-foreground" />
            )}
          </>
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-medium">
        <span className="text-emerald-500">Dafür {forPct.toFixed(0)}%</span>
        <span className="text-red-500">Gegen {againstPct.toFixed(0)}%</span>
        <span className="text-muted-foreground">Enthaltung {abstainPct.toFixed(0)}%</span>
      </div>
    </div>
  );
}

/**
 * Open-proposal hero card for the website feed — the web port of the Expo
 * `FeedProposalHeroCard`. When the proposal is Active the border is a spinning
 * gradient ring (`.proposal-animated-border`); otherwise it shows a static ring
 * with the vote outcome. The whole card links to the proposal detail page.
 */
export function FeedProposalHero({ proposal }: { proposal: Proposal }) {
  const isActive = proposal.state === ProposalState.Active;
  const isPending = proposal.state === ProposalState.Pending;
  const ended = !isActive && !isPending;

  // The spinning gradient ring highlights a live or upcoming vote; ended
  // proposals fall back to a static ring with the result.
  const highlight = isActive || isPending;

  const forVotes = BigInt(proposal.for_votes || "0");
  const againstVotes = BigInt(proposal.against_votes || "0");
  const abstainVotes = BigInt(proposal.abstain_votes || "0");
  const total = forVotes + againstVotes + abstainVotes;

  // Mirror the Expo card: outcome is decided by the vote split.
  const accepted = forVotes >= againstVotes;
  const showResults = ended && total > 0n;

  const buttonLabel = isActive
    ? "Jetzt abstimmen"
    : ended
      ? "Ergebnis ansehen"
      : "Vorschlag ansehen";

  const href = `/proposals/${proposal.proposal_id}`;

  return (
    <div
      className={`rounded-[14px] p-[2px] ${
        highlight ? "proposal-animated-border" : "bg-border"
      }`}
    >
      <Link
        href={href}
        className="flex gap-3 rounded-[12px] bg-card p-4 transition-colors hover:bg-muted/50"
      >
        <Image
          src={ILLUSTRATION}
          alt=""
          width={64}
          height={64}
          className="h-16 w-16 shrink-0 self-start object-contain"
        />

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-primary">Bürgerumfrage</span>

            {isActive ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-1 text-xs font-medium text-foreground">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                </span>
                Aktiv
              </span>
            ) : ended ? (
              <span
                className={`rounded-full px-2 py-1 text-xs font-medium ${
                  accepted
                    ? "bg-emerald-500/15 text-emerald-600"
                    : "bg-red-500/15 text-red-600"
                }`}
              >
                {accepted ? "Angenommen" : "Abgelehnt"}
              </span>
            ) : (
              <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                Bald
              </span>
            )}
          </div>

          <h3 className="line-clamp-2 text-base font-medium leading-snug text-foreground">
            {proposal.title}
          </h3>

          <p className="truncate text-xs font-medium text-muted-foreground">
            Von {formatAddress(proposal.proposer_address)} •{" "}
            {formatDateDE(proposal.created_at)}
          </p>

          {showResults && (
            <div className="space-y-1.5 pt-0.5">
              <VotingBars
                forVotes={forVotes}
                againstVotes={againstVotes}
                abstainVotes={abstainVotes}
              />
              <p className="text-xs text-muted-foreground">
                {total.toString()} {total === 1n ? "Stimme" : "Stimmen"}
              </p>
            </div>
          )}

          <span className="mt-1 inline-flex h-8 items-center rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground">
            {buttonLabel}
          </span>
        </div>
      </Link>
    </div>
  );
}
