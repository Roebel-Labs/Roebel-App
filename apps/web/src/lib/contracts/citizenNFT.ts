/**
 * Citizen Verification NFT Contract Interactions
 */

import { prepareContractCall, readContract, ThirdwebContract } from "thirdweb";
import type { Address } from "thirdweb/utils";

/**
 * Check if an address has already minted their citizen NFT
 */
export async function hasAlreadyMinted(
  contract: ThirdwebContract,
  address: Address
): Promise<boolean> {
  const result = await readContract({
    contract,
    method: "function hasAlreadyMinted(address) view returns (bool)",
    params: [address],
  });
  return result;
}

/**
 * Check if a nullifier has been used (prevents double-minting)
 */
export async function isNullifierUsed(
  contract: ThirdwebContract,
  nullifier: bigint
): Promise<boolean> {
  const result = await readContract({
    contract,
    method: "function isNullifierUsed(uint256) view returns (bool)",
    params: [nullifier],
  });
  return result;
}

/**
 * Get total supply of minted NFTs
 */
export async function getTotalSupply(contract: ThirdwebContract): Promise<bigint> {
  const result = await readContract({
    contract,
    method: "function totalSupply() view returns (uint256)",
    params: [],
  });
  return result;
}

/**
 * Get NFT balance for an address (should be 0 or 1)
 */
export async function getBalance(
  contract: ThirdwebContract,
  address: Address
): Promise<bigint> {
  const result = await readContract({
    contract,
    method: "function balanceOf(address) view returns (uint256)",
    params: [address],
  });
  return result;
}

/**
 * Mint NFT with Semaphore proof (anonymous minting)
 */
export function mintWithProof(
  contract: ThirdwebContract,
  merkleTreeDepth: bigint,
  merkleTreeRoot: bigint,
  nullifier: bigint,
  message: bigint,
  merkleTreeSiblings: bigint[],
  points: readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint]
) {
  return prepareContractCall({
    contract,
    method: "function mintWithProof(uint256, uint256, uint256, uint256, uint256[], uint256[8])",
    params: [
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
 * Helper: Check if user can mint
 */
export async function canMint(
  contract: ThirdwebContract,
  address: Address,
  nullifier: bigint
): Promise<{
  canMint: boolean;
  reason?: string;
  alreadyMinted: boolean;
  nullifierUsed: boolean;
}> {
  const [alreadyMinted, nullifierUsed] = await Promise.all([
    hasAlreadyMinted(contract, address),
    isNullifierUsed(contract, nullifier),
  ]);

  if (alreadyMinted) {
    return {
      canMint: false,
      reason: "You have already minted your Citizen NFT",
      alreadyMinted,
      nullifierUsed,
    };
  }

  if (nullifierUsed) {
    return {
      canMint: false,
      reason: "This proof has already been used",
      alreadyMinted,
      nullifierUsed,
    };
  }

  return {
    canMint: true,
    alreadyMinted,
    nullifierUsed,
  };
}

/**
 * Helper: Get NFT stats
 */
export async function getNFTStats(contract: ThirdwebContract) {
  const totalSupply = await getTotalSupply(contract);

  return {
    totalMinted: totalSupply,
  };
}
