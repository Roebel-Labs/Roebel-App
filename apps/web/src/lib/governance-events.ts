import { getContractEvents, prepareEvent } from "thirdweb";
import { governorContract } from "@/lib/verification-contracts";
import type { Proposal } from "@/lib/proposal-types";

const proposalCreatedEvent = prepareEvent({
  signature:
    "event ProposalCreated(uint256 proposalId, address proposer, address[] targets, uint256[] values, string[] signatures, bytes[] calldatas, uint256 voteStart, uint256 voteEnd, string description)",
});

const voteCastEvent = prepareEvent({
  signature:
    "event VoteCast(address indexed voter, uint256 proposalId, uint8 support, uint256 weight, string reason)",
});

const proposalQueuedEvent = prepareEvent({
  signature: "event ProposalQueued(uint256 proposalId, uint256 etaSeconds)",
});

const proposalExecutedEvent = prepareEvent({
  signature: "event ProposalExecuted(uint256 proposalId)",
});

const proposalCanceledEvent = prepareEvent({
  signature: "event ProposalCanceled(uint256 proposalId)",
});

export type GovernanceEventKind =
  | "created"
  | "vote"
  | "queued"
  | "executed"
  | "canceled";

export interface GovernanceEvent {
  kind: GovernanceEventKind;
  proposalId: string;
  blockNumber: bigint;
  txHash: string;
  // vote-only metadata
  voter?: string;
  support?: number;
  weight?: string;
  reason?: string;
  // queued metadata
  etaSeconds?: string;
  // created metadata
  proposer?: string;
}

interface RawEventArgs {
  proposalId?: bigint;
  voter?: string;
  support?: number;
  weight?: bigint;
  reason?: string;
  etaSeconds?: bigint;
  proposer?: string;
}

interface RawContractEvent {
  args: RawEventArgs;
  blockNumber: bigint;
  transactionHash: string;
}

export async function fetchGovernanceEvents(
  fromBlock: bigint
): Promise<GovernanceEvent[]> {
  const [created, votes, queued, executed, canceled] = await Promise.all([
    getContractEvents({
      contract: governorContract,
      events: [proposalCreatedEvent],
      fromBlock,
      toBlock: "latest",
    }) as Promise<RawContractEvent[]>,
    getContractEvents({
      contract: governorContract,
      events: [voteCastEvent],
      fromBlock,
      toBlock: "latest",
    }) as Promise<RawContractEvent[]>,
    getContractEvents({
      contract: governorContract,
      events: [proposalQueuedEvent],
      fromBlock,
      toBlock: "latest",
    }) as Promise<RawContractEvent[]>,
    getContractEvents({
      contract: governorContract,
      events: [proposalExecutedEvent],
      fromBlock,
      toBlock: "latest",
    }) as Promise<RawContractEvent[]>,
    getContractEvents({
      contract: governorContract,
      events: [proposalCanceledEvent],
      fromBlock,
      toBlock: "latest",
    }) as Promise<RawContractEvent[]>,
  ]);

  const all: GovernanceEvent[] = [
    ...created.map((e) => ({
      kind: "created" as const,
      proposalId: (e.args.proposalId ?? 0n).toString(),
      blockNumber: e.blockNumber,
      txHash: e.transactionHash,
      proposer: e.args.proposer,
    })),
    ...votes.map((e) => ({
      kind: "vote" as const,
      proposalId: (e.args.proposalId ?? 0n).toString(),
      blockNumber: e.blockNumber,
      txHash: e.transactionHash,
      voter: e.args.voter,
      support: e.args.support,
      weight: (e.args.weight ?? 0n).toString(),
      reason: e.args.reason,
    })),
    ...queued.map((e) => ({
      kind: "queued" as const,
      proposalId: (e.args.proposalId ?? 0n).toString(),
      blockNumber: e.blockNumber,
      txHash: e.transactionHash,
      etaSeconds: (e.args.etaSeconds ?? 0n).toString(),
    })),
    ...executed.map((e) => ({
      kind: "executed" as const,
      proposalId: (e.args.proposalId ?? 0n).toString(),
      blockNumber: e.blockNumber,
      txHash: e.transactionHash,
    })),
    ...canceled.map((e) => ({
      kind: "canceled" as const,
      proposalId: (e.args.proposalId ?? 0n).toString(),
      blockNumber: e.blockNumber,
      txHash: e.transactionHash,
    })),
  ];

  return all;
}

export interface ProposalTimelineGroup {
  proposal: Proposal | null;
  proposalId: string;
  events: GovernanceEvent[];
  latestBlock: bigint;
}

export function groupEventsByProposal(
  events: GovernanceEvent[],
  proposals: Proposal[]
): ProposalTimelineGroup[] {
  const proposalById = new Map<string, Proposal>();
  for (const p of proposals) {
    proposalById.set(p.blockchain_proposal_id, p);
  }

  const groups = new Map<string, GovernanceEvent[]>();
  for (const ev of events) {
    const arr = groups.get(ev.proposalId) ?? [];
    arr.push(ev);
    groups.set(ev.proposalId, arr);
  }

  const result: ProposalTimelineGroup[] = [];
  for (const [proposalId, evs] of groups) {
    evs.sort((a, b) => Number(a.blockNumber - b.blockNumber));
    const latestBlock = evs[evs.length - 1]?.blockNumber ?? 0n;
    result.push({
      proposalId,
      proposal: proposalById.get(proposalId) ?? null,
      events: evs,
      latestBlock,
    });
  }

  result.sort((a, b) => Number(b.latestBlock - a.latestBlock));
  return result;
}

const BASE_BLOCK_TIME_SECONDS = 2;

export interface BlockAnchor {
  blockNumber: bigint;
  timestampMs: number;
}

export function approxTimestampMs(
  blockNumber: bigint,
  anchor: BlockAnchor | null
): number | null {
  if (!anchor) return null;
  const blockDiff = Number(blockNumber - anchor.blockNumber);
  return anchor.timestampMs + blockDiff * BASE_BLOCK_TIME_SECONDS * 1000;
}

export function deriveBlockAnchor(
  proposals: Proposal[]
): BlockAnchor | null {
  const candidates = proposals.filter(
    (p) => p.block_number !== null && p.created_at
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const aBlock = BigInt(a.block_number ?? 0n);
    const bBlock = BigInt(b.block_number ?? 0n);
    return Number(aBlock - bBlock);
  });
  const first = candidates[0];
  return {
    blockNumber: BigInt(first.block_number!),
    timestampMs: new Date(first.created_at).getTime(),
  };
}

export function lowestProposalBlock(proposals: Proposal[]): bigint | null {
  let lowest: bigint | null = null;
  for (const p of proposals) {
    if (p.block_number === null) continue;
    const b = BigInt(p.block_number);
    if (lowest === null || b < lowest) lowest = b;
  }
  return lowest;
}
