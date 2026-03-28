/**
 * Citizen Registry Contract Interactions
 */

import { prepareContractCall, readContract, ThirdwebContract } from "thirdweb";
import { CONTRACTS, CITIZEN_REGISTRY_ABI, CITIZEN_GROUP_ID } from "../semaphore-config";
import type { Address } from "thirdweb/utils";

/**
 * Get total number of registered citizens
 */
export async function getCitizenCount(contract: ThirdwebContract): Promise<bigint> {
  const result = await readContract({
    contract,
    method: "function citizenCount() view returns (uint256)",
    params: [],
  });
  return result;
}

/**
 * Check if an identity commitment is registered as a citizen
 */
export async function isCitizen(
  contract: ThirdwebContract,
  identityCommitment: bigint
): Promise<boolean> {
  const result = await readContract({
    contract,
    method: "function isCitizen(uint256) view returns (bool)",
    params: [identityCommitment],
  });
  return result;
}

/**
 * Get identity commitment for a given address
 */
export async function getCommitmentByAddress(
  contract: ThirdwebContract,
  address: Address
): Promise<bigint> {
  const result = await readContract({
    contract,
    method: "function getCommitmentByAddress(address) view returns (uint256)",
    params: [address],
  });
  return result;
}

/**
 * Get the current merkle tree root
 */
export async function getGroupRoot(contract: ThirdwebContract): Promise<bigint> {
  const result = await readContract({
    contract,
    method: "function getGroupRoot() view returns (uint256)",
    params: [],
  });
  return result;
}

/**
 * Get the merkle tree depth
 */
export async function getGroupDepth(contract: ThirdwebContract): Promise<bigint> {
  const result = await readContract({
    contract,
    method: "function getGroupDepth() view returns (uint256)",
    params: [],
  });
  return result;
}

/**
 * Get the citizen group ID
 */
export async function getCitizenGroupId(contract: ThirdwebContract): Promise<bigint> {
  const result = await readContract({
    contract,
    method: "function citizenGroupId() view returns (uint256)",
    params: [],
  });
  return result;
}

/**
 * Add a single citizen (admin only)
 */
export function addCitizen(contract: ThirdwebContract, identityCommitment: bigint, citizenAddress: Address) {
  return prepareContractCall({
    contract,
    method: "function addCitizen(uint256, address)",
    params: [identityCommitment, citizenAddress],
  });
}

/**
 * Add multiple citizens in batch (admin only)
 */
export function addCitizensBatch(contract: ThirdwebContract, identityCommitments: bigint[]) {
  return prepareContractCall({
    contract,
    method: "function addCitizensBatch(uint256[])",
    params: [identityCommitments as any],
  });
}

/**
 * Helper: Check if current user is registered
 */
export async function isUserRegistered(
  contract: ThirdwebContract,
  userAddress: Address
): Promise<{ registered: boolean; commitment: bigint }> {
  const commitment = await getCommitmentByAddress(contract, userAddress);
  const registered = commitment > 0n;

  return { registered, commitment };
}

/**
 * Helper: Get citizen statistics
 */
export async function getCitizenStats(contract: ThirdwebContract) {
  const [count, root, depth] = await Promise.all([
    getCitizenCount(contract),
    getGroupRoot(contract),
    getGroupDepth(contract),
  ]);

  return {
    totalCitizens: count,
    merkleRoot: root,
    treeDepth: depth,
    groupId: CITIZEN_GROUP_ID,
  };
}
