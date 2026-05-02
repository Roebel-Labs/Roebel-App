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
  const block = first.block_number;
  if (block === null) return null;
  return {
    blockNumber: BigInt(block),
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

// ---------- Client-safe serialized shapes ----------
// React Server Components cannot pass `bigint` across the boundary,
// so we serialize block numbers and timestamps to plain strings/numbers.

export interface SerializedGovernanceEvent
  extends Omit<GovernanceEvent, "blockNumber"> {
  blockNumber: string;
}

export interface SerializedProposalRef {
  proposal_id: string;
  blockchain_proposal_id: string;
  proposal_number: number;
  title: string;
  state: number;
  for_votes: string;
  against_votes: string;
  abstain_votes: string;
  proposer_address: string;
  created_at: string;
}

export interface SerializedProposalGroup {
  proposalId: string;
  proposal: SerializedProposalRef | null;
  events: SerializedGovernanceEvent[];
  latestBlock: string;
}

export interface SerializedBlockAnchor {
  blockNumber: string;
  timestampMs: number;
}

export function serializeEvent(
  e: GovernanceEvent
): SerializedGovernanceEvent {
  return { ...e, blockNumber: e.blockNumber.toString() };
}

export function serializeProposal(
  p: Proposal
): SerializedProposalRef {
  return {
    proposal_id: p.proposal_id,
    blockchain_proposal_id: p.blockchain_proposal_id,
    proposal_number: p.proposal_number,
    title: p.title,
    state: p.state,
    for_votes: p.for_votes,
    against_votes: p.against_votes,
    abstain_votes: p.abstain_votes,
    proposer_address: p.proposer_address,
    created_at: p.created_at,
  };
}

export function serializeGroups(
  groups: ProposalTimelineGroup[]
): SerializedProposalGroup[] {
  return groups.map((g) => ({
    proposalId: g.proposalId,
    proposal: g.proposal ? serializeProposal(g.proposal) : null,
    events: g.events.map(serializeEvent),
    latestBlock: g.latestBlock.toString(),
  }));
}

export function serializeAnchor(
  anchor: BlockAnchor | null
): SerializedBlockAnchor | null {
  if (!anchor) return null;
  return {
    blockNumber: anchor.blockNumber.toString(),
    timestampMs: anchor.timestampMs,
  };
}

export function approxTimestampMsFromSerialized(
  blockNumber: string,
  anchor: SerializedBlockAnchor | null
): number | null {
  if (!anchor) return null;
  const blockDiff = Number(BigInt(blockNumber) - BigInt(anchor.blockNumber));
  return anchor.timestampMs + blockDiff * BASE_BLOCK_TIME_SECONDS * 1000;
}
