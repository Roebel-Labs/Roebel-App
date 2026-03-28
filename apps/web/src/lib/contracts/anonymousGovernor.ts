/**
 * Anonymous Governor Contract Interactions
 */

import { prepareContractCall, readContract, ThirdwebContract } from "thirdweb";
import { ProposalState, VoteSupport } from "../semaphore-config";
import { keccak256, encodePacked } from "viem";

/**
 * Get proposal state
 */
export async function getProposalState(
  contract: ThirdwebContract,
  proposalId: bigint
): Promise<ProposalState> {
  const result = await readContract({
    contract,
    method: "function state(uint256) view returns (uint8)",
    params: [proposalId],
  });
  return result as ProposalState;
}

/**
 * Get proposal vote counts
 */
export async function getProposalVoteCounts(
  contract: ThirdwebContract,
  proposalId: bigint
): Promise<{
  forVotes: bigint;
  againstVotes: bigint;
  abstainVotes: bigint;
}> {
  const result = await readContract({
    contract,
    method: "function proposalVoteCounts(uint256) view returns (uint256, uint256, uint256)",
    params: [proposalId],
  });

  return {
    forVotes: result[0],
    againstVotes: result[1],
    abstainVotes: result[2],
  };
}

/**
 * Get proposal nullifier (unique per proposal)
 */
export async function getProposalNullifier(
  contract: ThirdwebContract,
  proposalId: bigint
): Promise<bigint> {
  const result = await readContract({
    contract,
    method: "function proposalNullifiers(uint256) view returns (uint256)",
    params: [proposalId],
  });
  return result;
}

/**
 * Hash a proposal to get its ID
 */
export function hashProposal(
  targets: string[],
  values: bigint[],
  calldatas: string[],
  descriptionHash: string
): bigint {
  // This matches OpenZeppelin Governor's hashProposal
  const encoded = encodePacked(
    ["address[]", "uint256[]", "bytes[]", "bytes32"],
    [targets as `0x${string}`[], values, calldatas as `0x${string}`[], descriptionHash as `0x${string}`]
  );
  const hash = keccak256(encoded);
  return BigInt(hash);
}

/**
 * Create anonymous proposal
 */
export function proposeAnonymous(
  contract: ThirdwebContract,
  targets: string[],
  values: bigint[],
  calldatas: string[],
  description: string,
  merkleTreeDepth: bigint,
  merkleTreeRoot: bigint,
  nullifier: bigint,
  message: bigint,
  merkleTreeSiblings: bigint[],
  points: readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint]
) {
  return prepareContractCall({
    contract,
    method:
      "function proposeAnonymous(address[], uint256[], bytes[], string, uint256, uint256, uint256, uint256, uint256[], uint256[8])",
    params: [
      targets as any,
      values as any,
      calldatas as any,
      description,
      merkleTreeDepth,
      merkleTreeRoot,
      nullifier,
      message,
      merkleTreeSiblings as any,
      points as any,
    ],
  });
}

/**
 * Cast anonymous vote
 */
export function castVoteAnonymous(
  contract: ThirdwebContract,
  proposalId: bigint,
  support: VoteSupport,
  reason: string,
  merkleTreeDepth: bigint,
  merkleTreeRoot: bigint,
  nullifier: bigint,
  message: bigint,
  merkleTreeSiblings: bigint[],
  points: readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint]
) {
  return prepareContractCall({
    contract,
    method:
      "function castVoteAnonymous(uint256, uint8, string, uint256, uint256, uint256, uint256, uint256[], uint256[8])",
    params: [
      proposalId,
      support,
      reason,
      merkleTreeDepth,
      merkleTreeRoot,
      nullifier,
      message,
      merkleTreeSiblings,
      points,
    ],
  });
}

/**
 * Helper: Get proposal details
 */
export async function getProposalDetails(
  contract: ThirdwebContract,
  proposalId: bigint
) {
  const [state, votes, proposalNullifier] = await Promise.all([
    getProposalState(contract, proposalId),
    getProposalVoteCounts(contract, proposalId),
    getProposalNullifier(contract, proposalId),
  ]);

  return {
    proposalId,
    state,
    forVotes: votes.forVotes,
    againstVotes: votes.againstVotes,
    abstainVotes: votes.abstainVotes,
    totalVotes: votes.forVotes + votes.againstVotes + votes.abstainVotes,
    proposalNullifier,
  };
}

/**
 * Helper: Get proposal state name
 */
export function getProposalStateName(state: ProposalState): string {
  const names: Record<ProposalState, string> = {
    [ProposalState.PENDING]: "Pending",
    [ProposalState.ACTIVE]: "Active",
    [ProposalState.CANCELED]: "Canceled",
    [ProposalState.DEFEATED]: "Defeated",
    [ProposalState.SUCCEEDED]: "Succeeded",
    [ProposalState.QUEUED]: "Queued",
    [ProposalState.EXPIRED]: "Expired",
    [ProposalState.EXECUTED]: "Executed",
  };
  return names[state] || "Unknown";
}

/**
 * Helper: Check if proposal is votable
 */
export function isProposalVotable(state: ProposalState): boolean {
  return state === ProposalState.ACTIVE;
}

/**
 * Helper: Check if proposal passed
 */
export function didProposalPass(state: ProposalState): boolean {
  return (
    state === ProposalState.SUCCEEDED ||
    state === ProposalState.QUEUED ||
    state === ProposalState.EXECUTED
  );
}
