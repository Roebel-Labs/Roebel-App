"use client";

import { useCallback, useEffect, useState } from "react";
import { readContract } from "thirdweb";
import { attesterNFTContract, citizenNFTContract } from "@/lib/verification-contracts";
import { fetchGovernanceEvents } from "@/lib/governance-events";
import type { GovernanceEvent } from "@/lib/governance-events";
import { getProposals, getProposalStats } from "@/lib/supabase";
import type { Proposal } from "@/lib/proposal-types";
import { ProposalState } from "@/lib/proposal-types";

export interface RequestStatusCounts {
  pending: number;
  approved: number;
  rejected: number;
  executed: number;
  total: number;
}

export interface ProposalStateCounts {
  total: number;
  pending: number;
  active: number;
  canceled: number;
  defeated: number;
  succeeded: number;
  queued: number;
  expired: number;
  executed: number;
}

export interface DaoStats {
  attesterRequests: RequestStatusCounts;
  citizenRequests: RequestStatusCounts;
  proposalCounts: ProposalStateCounts;
  proposals: Proposal[];
  events: GovernanceEvent[];
  totalVotesCast: number;
  uniqueVoters: number;
}

export interface UseDaoStatsResult {
  stats: DaoStats | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
  lastUpdated: Date | null;
}

const CHUNK_SIZE = 8;

async function fetchRequestStatuses(
  contract: typeof attesterNFTContract,
  isCitizen: boolean
): Promise<RequestStatusCounts> {
  const totalRaw = (await readContract({
    contract,
    method: "function requestCount() view returns (uint256)",
    params: [],
  })) as bigint;

  const total = Number(totalRaw);
  const counts: RequestStatusCounts = {
    pending: 0,
    approved: 0,
    rejected: 0,
    executed: 0,
    total,
  };

  if (total === 0) return counts;

  const ids = Array.from({ length: total }, (_, i) => i + 1);

  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    const results = await Promise.all(
      chunk.map((id) =>
        readContract({
          contract,
          method: isCitizen
            ? "function getRequest(uint256 requestId) view returns (address requester, address target, uint8 requestType, uint8 status, string evidenceURI, uint256 attesterSignatures, uint256 citizenSignatures, uint256 createdAt)"
            : "function getRequest(uint256 requestId) view returns (address requester, address target, uint8 requestType, uint8 status, string evidenceURI, uint256 signatureCount, uint256 createdAt)",
          params: [BigInt(id)],
        }).catch((err) => {
          console.warn(`[useDaoStats] getRequest(${id}) failed`, err);
          return null;
        })
      )
    );

    for (const res of results) {
      if (!res) continue;
      const status = Number((res as unknown as unknown[])[3]);
      if (status === 0) counts.pending += 1;
      else if (status === 1) counts.approved += 1;
      else if (status === 2) counts.rejected += 1;
      else if (status === 3) counts.executed += 1;
    }
  }

  return counts;
}

function bucketProposals(proposals: Proposal[]): ProposalStateCounts {
  const counts: ProposalStateCounts = {
    total: proposals.length,
    pending: 0,
    active: 0,
    canceled: 0,
    defeated: 0,
    succeeded: 0,
    queued: 0,
    expired: 0,
    executed: 0,
  };

  for (const p of proposals) {
    switch (p.state) {
      case ProposalState.Pending:
        counts.pending += 1;
        break;
      case ProposalState.Active:
        counts.active += 1;
        break;
      case ProposalState.Canceled:
        counts.canceled += 1;
        break;
      case ProposalState.Defeated:
        counts.defeated += 1;
        break;
      case ProposalState.Succeeded:
        counts.succeeded += 1;
        break;
      case ProposalState.Queued:
        counts.queued += 1;
        break;
      case ProposalState.Expired:
        counts.expired += 1;
        break;
      case ProposalState.Executed:
        counts.executed += 1;
        break;
    }
  }

  return counts;
}

export function useDaoStats(): UseDaoStatsResult {
  const [stats, setStats] = useState<DaoStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [attesterCounts, citizenCounts, proposalsRes, statsRes, events] =
        await Promise.all([
          fetchRequestStatuses(attesterNFTContract, false),
          fetchRequestStatuses(citizenNFTContract, true),
          getProposals({ orderBy: "created_at", orderDirection: "desc", limit: 1000 }),
          getProposalStats(),
          fetchGovernanceEvents(0n).catch((err) => {
            console.warn("[useDaoStats] event fetch failed", err);
            return [] as GovernanceEvent[];
          }),
        ]);

      const proposals = proposalsRes.success ? proposalsRes.data?.proposals ?? [] : [];
      const proposalCounts = statsRes.success && statsRes.data
        ? {
            ...bucketProposals(proposals),
            total: statsRes.data.total,
            active: statsRes.data.active,
            succeeded: statsRes.data.succeeded,
            defeated: statsRes.data.defeated,
            executed: statsRes.data.executed,
          }
        : bucketProposals(proposals);

      const voters = new Set<string>();
      let totalVotes = 0;
      for (const ev of events) {
        if (ev.kind === "vote") {
          totalVotes += 1;
          if (ev.voter) voters.add(ev.voter.toLowerCase());
        }
      }

      setStats({
        attesterRequests: attesterCounts,
        citizenRequests: citizenCounts,
        proposalCounts,
        proposals,
        events,
        totalVotesCast: totalVotes,
        uniqueVoters: voters.size,
      });
      setLastUpdated(new Date());
    } catch (err) {
      console.error("[useDaoStats] load failed", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { stats, isLoading, error, refresh: load, lastUpdated };
}
