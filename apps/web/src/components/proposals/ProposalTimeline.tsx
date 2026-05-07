"use client";

import { useEffect, useState } from "react";
import type { Proposal } from "@/lib/proposal-types";
import { useReadContract } from "thirdweb/react";
import { readContract } from "thirdweb";
import { governorContract } from "@/lib/contracts";
import { ProposalCountdown } from "./ProposalCountdown";

interface ProposalTimelineProps {
  proposal: Proposal;
}

/**
 * Reads the governor's own `clock()` and `CLOCK_MODE()` so dates are correct
 * regardless of whether we're talking to the legacy block-number governor or
 * the current MACI Governor (which uses Unix timestamps as its clock).
 */
const BASE_BLOCK_TIME = 2; // seconds per block, only used in block-number mode

type ClockMode = "timestamp" | "blocknumber";

export function ProposalTimeline({ proposal }: ProposalTimelineProps) {
  const blockchainProposalId = proposal?.blockchain_proposal_id;
  const [clockMode, setClockMode] = useState<ClockMode>("timestamp");
  const [clockNow, setClockNow] = useState<bigint>(BigInt(0));

  const { data: votingDelay } = useReadContract({
    contract: governorContract,
    method: "function votingDelay() view returns (uint256)",
    params: [],
  });

  const { data: votingPeriod } = useReadContract({
    contract: governorContract,
    method: "function votingPeriod() view returns (uint256)",
    params: [],
  });

  const { data: proposalSnapshot } = useReadContract({
    contract: governorContract,
    method: "function proposalSnapshot(uint256 proposalId) view returns (uint256)",
    params: blockchainProposalId ? [BigInt(blockchainProposalId)] : [BigInt(0)],
    queryOptions: { enabled: !!blockchainProposalId },
  });

  const { data: proposalDeadline } = useReadContract({
    contract: governorContract,
    method: "function proposalDeadline(uint256 proposalId) view returns (uint256)",
    params: blockchainProposalId ? [BigInt(blockchainProposalId)] : [BigInt(0)],
    queryOptions: { enabled: !!blockchainProposalId },
  });

  // CLOCK_MODE — once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mode = (await readContract({
          contract: governorContract,
          method: "function CLOCK_MODE() view returns (string)",
          params: [],
        })) as string;
        if (!cancelled) setClockMode(mode.includes("mode=blocknumber") ? "blocknumber" : "timestamp");
      } catch {
        if (!cancelled) setClockMode("blocknumber");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Poll governor's clock so the timeline always agrees with what the contract sees.
  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | undefined;

    const fetchClock = async () => {
      try {
        const value = (await readContract({
          contract: governorContract,
          method: "function clock() view returns (uint48)",
          params: [],
        })) as bigint;
        if (!cancelled) setClockNow(value);
      } catch (err) {
        console.warn("[ProposalTimeline] clock() read failed:", err);
      }
    };

    fetchClock();
    interval = setInterval(fetchClock, 10000);
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, []);

  // Convert (clockUnit) -> wall-clock Date.
  const clockUnitToDate = (target: bigint): Date => {
    if (clockMode === "timestamp") {
      // target is a Unix-seconds timestamp.
      return new Date(Number(target) * 1000);
    }
    // block-number mode: estimate via diff to current block.
    const blockDiff = target - clockNow;
    const secondsDiff = Number(blockDiff) * BASE_BLOCK_TIME;
    return new Date(Date.now() + secondsDiff * 1000);
  };

  const formatDate = (date: Date) =>
    date.toLocaleDateString("de-DE", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  const createdDate = new Date(proposal.created_at);

  // proposalSnapshot is the moment voting STARTS (snapshot block/time).
  const votingStartUnit = proposalSnapshot ?? BigInt(0);
  const votingEndUnit = proposalDeadline ?? BigInt(0);
  const votingStartDate = proposalSnapshot ? clockUnitToDate(votingStartUnit) : createdDate;
  const votingEndDate = proposalDeadline
    ? clockUnitToDate(votingEndUnit)
    : new Date(createdDate.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Phase + countdown
  const isPending = clockNow > 0n && clockNow < votingStartUnit;
  const isActive = clockNow > 0n && clockNow >= votingStartUnit && clockNow <= votingEndUnit;
  const isEnded = clockNow > 0n && clockNow > votingEndUnit;

  const unitsToSeconds = (n: bigint) =>
    clockMode === "timestamp" ? Number(n) : Number(n) * BASE_BLOCK_TIME;

  // Both votingDelay and votingPeriod are in clock units. In timestamp mode
  // they are seconds directly; in block-number mode multiply by block time.
  const votingDelaySeconds = votingDelay ? unitsToSeconds(votingDelay) : 0;
  const votingPeriodSeconds = votingPeriod ? unitsToSeconds(votingPeriod) : 0;

  const secondsToStart = isPending ? unitsToSeconds(votingStartUnit - clockNow) : 0;
  const secondsToEnd = isActive ? unitsToSeconds(votingEndUnit - clockNow) : 0;

  const formatDuration = (seconds: number): string => {
    if (seconds <= 0) return "—";
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  return (
    <div className="space-y-6">
      {/* Countdown */}
      {clockNow > 0n && (
        <>
          {isPending && proposalSnapshot && (
            <ProposalCountdown
              secondsRemaining={secondsToStart}
              totalSeconds={votingDelaySeconds || 86400}
              label="Abstimmung startet in"
              isPending
            />
          )}
          {isActive && proposalDeadline && (
            <ProposalCountdown
              secondsRemaining={secondsToEnd}
              totalSeconds={votingPeriodSeconds || 1800}
              label="Abstimmung endet in"
            />
          )}
        </>
      )}

      {/* Timeline */}
      <div className="bg-card border border-border rounded-xl shadow-sm p-6">
        <div className="flex items-center gap-2 mb-6">
          <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="text-lg font-medium text-foreground">TIMELINE</h2>
        </div>

        <div className="space-y-6">
          {/* Created */}
          <div className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className="w-3 h-3 bg-black rounded-full" />
              <div className="w-0.5 h-full bg-muted mt-2" />
            </div>
            <div className="flex-1 pb-2">
              <div className="font-medium text-foreground mb-1">Erstellt</div>
              <div className="text-sm text-muted-foreground">{formatDate(createdDate)}</div>
            </div>
          </div>

          {/* Voting Start */}
          <div className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className={`w-3 h-3 rounded-full ${isActive || isEnded ? "bg-black" : "bg-yellow-500"}`} />
              <div className="w-0.5 h-full bg-muted mt-2" />
            </div>
            <div className="flex-1 pb-2">
              <div className={`font-medium mb-1 ${isActive || isEnded ? "text-foreground" : "text-yellow-600"}`}>
                Abstimmung beginnt {isPending && "⏳"}
              </div>
              <div className="text-sm text-muted-foreground">{formatDate(votingStartDate)}</div>
              {votingDelay && votingDelay > 0n && (
                <div className="text-xs text-muted-foreground mt-1">
                  Vorlaufzeit: {formatDuration(votingDelaySeconds)}
                </div>
              )}
            </div>
          </div>

          {/* Voting End */}
          <div className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className={`w-3 h-3 rounded-full ${isEnded ? "bg-black" : "bg-muted"}`} />
            </div>
            <div className="flex-1">
              <div className={`font-medium mb-1 ${isEnded ? "text-foreground" : "text-muted-foreground"}`}>
                Abstimmung endet {isActive && "🗳️"}
              </div>
              <div className="text-sm text-muted-foreground">{formatDate(votingEndDate)}</div>
              {votingPeriod && (
                <div className="text-xs text-muted-foreground mt-1">
                  Dauer: {formatDuration(votingPeriodSeconds)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Governance Parameters Info */}
        <div className="mt-6 pt-6 border-t border-border">
          <div className="text-xs text-muted-foreground space-y-1">
            <div>
              {clockMode === "timestamp" ? "Zeit (Unix s)" : "Block"}: {clockNow.toString()}
            </div>
            {votingDelay !== undefined && (
              <div>
                Vorlaufzeit: {formatDuration(votingDelaySeconds)}
                {clockMode === "timestamp" ? "" : ` (${votingDelay.toString()} blocks)`}
              </div>
            )}
            {votingPeriod !== undefined && (
              <div>
                Abstimmungsdauer: {formatDuration(votingPeriodSeconds)}
                {clockMode === "timestamp" ? "" : ` (${votingPeriod.toString()} blocks)`}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
