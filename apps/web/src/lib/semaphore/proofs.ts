/**
 * Semaphore Proof Generation Utilities
 */

import { Identity } from "@semaphore-protocol/identity";
import { Group } from "@semaphore-protocol/group";
import { generateProof, type SemaphoreProof } from "@semaphore-protocol/proof";
import { SNARK_FIELD_SIZE } from "../semaphore-config";
import { keccak256, toBytes } from "viem";

/**
 * Hash a message to fit in SNARK field
 */
export function hashToField(message: string): bigint {
  const hash = keccak256(toBytes(message));
  return BigInt(hash) % SNARK_FIELD_SIZE;
}

/**
 * Hash address to fit in SNARK field (for binding proofs to addresses)
 */
export function hashAddressToField(address: string): bigint {
  const hash = keccak256(toBytes(address.toLowerCase()));
  return BigInt(hash) % SNARK_FIELD_SIZE;
}

/**
 * Generate proof for NFT minting
 * Message should be hash of minter's address
 */
export async function generateMintProof(
  identity: Identity,
  group: Group,
  minterAddress: string,
  scope: bigint
): Promise<SemaphoreProof> {
  const message = hashAddressToField(minterAddress);

  return await generateProof(identity, group, message, scope);
}

/**
 * Generate proof for proposal creation
 * Message should be hash of proposal description
 */
export async function generateProposalProof(
  identity: Identity,
  group: Group,
  proposalDescription: string,
  scope: bigint
): Promise<SemaphoreProof> {
  const message = hashToField(proposalDescription);

  return await generateProof(identity, group, message, scope);
}

/**
 * Generate proof for voting
 * Message should be hash of (proposalId + support + proposalNullifier)
 */
export async function generateVoteProof(
  identity: Identity,
  group: Group,
  proposalId: bigint,
  support: number,
  proposalNullifier: bigint,
  scope: bigint
): Promise<SemaphoreProof> {
  // Create message from proposal ID, support, and proposal nullifier
  const combinedData = `${proposalId.toString()}-${support}-${proposalNullifier.toString()}`;
  const message = hashToField(combinedData);

  return await generateProof(identity, group, message, scope);
}

/**
 * Convert Semaphore proof to contract-compatible format
 */
export function formatProofForContract(proof: any) {
  return {
    merkleTreeDepth: BigInt(proof.merkleTreeDepth || proof.depth || 20),
    merkleTreeRoot: BigInt(proof.merkleTreeRoot || proof.root),
    nullifier: BigInt(proof.nullifier),
    message: BigInt(proof.message || proof.signal),
    merkleTreeSiblings: (proof.merkleTreeSiblings || proof.siblings || []).map((s: any) => BigInt(s)),
    points: (proof.points || proof.proof || []).map((p: any) => BigInt(p)) as readonly [
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      bigint
    ],
  };
}

/**
 * Helper: Verify proof structure is valid
 */
export function isValidProof(proof: any): boolean {
  try {
    const depth = proof.merkleTreeDepth || proof.depth || 0;
    const root = proof.merkleTreeRoot || proof.root;
    const points = proof.points || proof.proof || [];
    const siblings = proof.merkleTreeSiblings || proof.siblings || [];

    return (
      depth > 0 &&
      BigInt(root) > 0n &&
      BigInt(proof.nullifier) > 0n &&
      points.length === 8 &&
      siblings.length > 0
    );
  } catch {
    return false;
  }
}

/**
 * Helper: Get proof info for debugging
 */
export function getProofInfo(proof: any) {
  const depth = proof.merkleTreeDepth || proof.depth || 20;
  const root = proof.merkleTreeRoot || proof.root;
  const message = proof.message || proof.signal;
  const siblings = proof.merkleTreeSiblings || proof.siblings || [];
  const points = proof.points || proof.proof || [];

  return {
    merkleTreeDepth: depth,
    merkleTreeRoot: `0x${BigInt(root).toString(16)}`,
    nullifier: `0x${BigInt(proof.nullifier).toString(16)}`,
    message: `0x${BigInt(message).toString(16)}`,
    scope: proof.scope,
    siblingsCount: siblings.length,
    pointsCount: points.length,
  };
}
