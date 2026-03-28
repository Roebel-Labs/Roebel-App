/**
 * Semaphore Group Synchronization
 * Fetches citizen group members from blockchain
 */

import { Group } from "@semaphore-protocol/group";
import { readContract, ThirdwebContract } from "thirdweb";
import { CITIZEN_GROUP_ID } from "../semaphore-config";

/**
 * Fetch group data from Semaphore contract
 */
export async function fetchGroupData(semaphoreContract: ThirdwebContract) {
  const [root, depth, size] = await Promise.all([
    readContract({
      contract: semaphoreContract,
      method: "function getMerkleTreeRoot(uint256) view returns (uint256)",
      params: [CITIZEN_GROUP_ID],
    }),
    readContract({
      contract: semaphoreContract,
      method: "function getMerkleTreeDepth(uint256) view returns (uint256)",
      params: [CITIZEN_GROUP_ID],
    }),
    readContract({
      contract: semaphoreContract,
      method: "function getMerkleTreeSize(uint256) view returns (uint256)",
      params: [CITIZEN_GROUP_ID],
    }),
  ]);

  return {
    groupId: CITIZEN_GROUP_ID,
    root,
    depth: Number(depth),
    size: Number(size),
  };
}

/**
 * Create a Semaphore Group from on-chain data
 * Note: This creates an empty group with the correct parameters
 * For proof generation, you need the actual member list
 */
export async function createGroupFromChain(
  semaphoreContract: ThirdwebContract
): Promise<Group> {
  const { groupId, depth } = await fetchGroupData(semaphoreContract);

  // Create group (Semaphore v4 doesn't take parameters in constructor)
  const group = new Group();

  return group;
}

/**
 * Fetch all citizen commitments from events
 * This is more complex and requires event querying
 * For MVP, we'll use a simpler approach
 */
export async function fetchCitizenCommitments(
  citizenRegistryContract: ThirdwebContract
): Promise<bigint[]> {
  // TODO: Implement event fetching for MemberAdded events
  // For now, return empty array
  // In production, you'd query CitizenRegistry for MemberAdded events

  console.warn("fetchCitizenCommitments: Event querying not yet implemented");
  console.warn("For proof generation, you'll need to track members off-chain or via subgraph");

  return [];
}

/**
 * Create a complete group with all members (for proof generation)
 * Requires off-chain tracking of members or event indexing
 */
export async function createCompleteGroup(
  semaphoreContract: ThirdwebContract,
  citizenRegistryContract: ThirdwebContract,
  knownMembers?: bigint[]
): Promise<Group> {
  const { groupId, depth } = await fetchGroupData(semaphoreContract);

  // Create group (Semaphore v4 doesn't take parameters in constructor)
  const group = new Group();

  // Add known members if provided
  if (knownMembers && knownMembers.length > 0) {
    knownMembers.forEach((commitment) => {
      group.addMember(commitment);
    });
  } else {
    // Try to fetch from events
    const commitments = await fetchCitizenCommitments(citizenRegistryContract);
    commitments.forEach((commitment) => {
      group.addMember(commitment);
    });
  }

  return group;
}

/**
 * Helper: Verify group root matches on-chain
 */
export async function verifyGroupRoot(
  group: Group,
  semaphoreContract: ThirdwebContract
): Promise<boolean> {
  const onChainRoot = await readContract({
    contract: semaphoreContract,
    method: "function getMerkleTreeRoot(uint256) view returns (uint256)",
    params: [CITIZEN_GROUP_ID],
  });

  const localRoot = BigInt(group.root.toString());

  return localRoot === onChainRoot;
}

/**
 * Helper: Get group info for display
 */
export async function getGroupInfo(semaphoreContract: ThirdwebContract) {
  const data = await fetchGroupData(semaphoreContract);

  return {
    groupId: data.groupId.toString(),
    merkleRoot: `0x${data.root.toString(16)}`,
    treeDepth: data.depth,
    memberCount: data.size,
  };
}
