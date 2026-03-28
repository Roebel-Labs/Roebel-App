/**
 * Semaphore System Configuration
 * Base Mainnet deployment for Roebel (Hometown) DAO
 */

import { base } from "thirdweb/chains";

// Contract Addresses on Base Mainnet
export const CONTRACTS = {
  // Semaphore Protocol (deployed by PSE team)
  SEMAPHORE: "0x8A1fd199516489B0Fb7153EB5f075cDAC83c693D",

  // Your deployed contracts
  CITIZEN_REGISTRY: "0xB2Ec982d7318A29746862AF3fc0F8B9C4E2E86B9",
  CITIZEN_NFT: "0xD9f1D05215415ac3DeC093Cf55D2f653EF06264C",
  ANONYMOUS_GOVERNOR: "0x1cA1849B640d026c6884b119013f8E72551415F7",
} as const;

// Semaphore Group Configuration
export const CITIZEN_GROUP_ID = BigInt(7);

// Network Configuration
export const NETWORK = base; // Base Mainnet (Chain ID: 8453)

// Governance Parameters (from contract deployment)
export const GOVERNANCE_CONFIG = {
  VOTING_DELAY: 86400, // 1 day in seconds
  VOTING_PERIOD: 604800, // 7 days in seconds
  PROPOSAL_THRESHOLD: 1, // 1 citizen minimum
  QUORUM_PERCENTAGE: 10, // 10% of citizens must vote
  SUPPORT_THRESHOLD: 51, // 51% support required to pass
} as const;

// SNARK Field Size (for proof generation)
export const SNARK_FIELD_SIZE = BigInt(
  "21888242871839275222246405745257275088548364400416034343698204186575808495617"
);

// Application Storage Keys
export const STORAGE_KEYS = {
  IDENTITY: "hometown-dao-identity",
  IDENTITY_BACKUP: "hometown-dao-identity-backup",
  APPLICATION: "hometown-dao-application",
  APPLICATION_STATUS: "hometown-dao-application-status",
} as const;

// Application Status Enum
export enum ApplicationStatus {
  DRAFT = "draft",
  SUBMITTED = "submitted",
  UNDER_REVIEW = "under_review",
  APPROVED = "approved",
  REJECTED = "rejected",
  REGISTERED = "registered", // Added to blockchain
}

// Proposal State Enum (matches OpenZeppelin Governor)
export enum ProposalState {
  PENDING = 0,
  ACTIVE = 1,
  CANCELED = 2,
  DEFEATED = 3,
  SUCCEEDED = 4,
  QUEUED = 5,
  EXPIRED = 6,
  EXECUTED = 7,
}

// Vote Support Enum
export enum VoteSupport {
  AGAINST = 0,
  FOR = 1,
  ABSTAIN = 2,
}

// Contract ABIs (minimal, only what we need)
export const CITIZEN_REGISTRY_ABI = [
  {
    inputs: [],
    name: "citizenGroupId",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "citizenCount",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "identityCommitment", type: "uint256" }],
    name: "isCitizen",
    outputs: [{ type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "identityCommitment", type: "uint256" },
      { name: "citizenAddress", type: "address" },
    ],
    name: "addCitizen",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "identityCommitments", type: "uint256[]" }],
    name: "addCitizensBatch",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "citizenAddress", type: "address" }],
    name: "getCommitmentByAddress",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getGroupRoot",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const CITIZEN_NFT_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "hasAlreadyMinted",
    outputs: [{ type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "nullifier", type: "uint256" }],
    name: "isNullifierUsed",
    outputs: [{ type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "merkleTreeDepth", type: "uint256" },
      { name: "merkleTreeRoot", type: "uint256" },
      { name: "nullifier", type: "uint256" },
      { name: "message", type: "uint256" },
      { name: "merkleTreeSiblings", type: "uint256[]" },
      { name: "points", type: "uint256[8]" },
    ],
    name: "mintWithProof",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "totalSupply",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const ANONYMOUS_GOVERNOR_ABI = [
  {
    inputs: [{ name: "proposalId", type: "uint256" }],
    name: "state",
    outputs: [{ type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "proposalId", type: "uint256" }],
    name: "proposalVoteCounts",
    outputs: [
      { name: "forVotes", type: "uint256" },
      { name: "againstVotes", type: "uint256" },
      { name: "abstainVotes", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "proposalId", type: "uint256" }],
    name: "proposalNullifiers",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "targets", type: "address[]" },
      { name: "values", type: "uint256[]" },
      { name: "calldatas", type: "bytes[]" },
      { name: "description", type: "string" },
      { name: "merkleTreeDepth", type: "uint256" },
      { name: "merkleTreeRoot", type: "uint256" },
      { name: "nullifier", type: "uint256" },
      { name: "message", type: "uint256" },
      { name: "merkleTreeSiblings", type: "uint256[]" },
      { name: "points", type: "uint256[8]" },
    ],
    name: "proposeAnonymous",
    outputs: [{ type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "proposalId", type: "uint256" },
      { name: "support", type: "uint8" },
      { name: "reason", type: "string" },
      { name: "merkleTreeDepth", type: "uint256" },
      { name: "merkleTreeRoot", type: "uint256" },
      { name: "nullifier", type: "uint256" },
      { name: "message", type: "uint256" },
      { name: "merkleTreeSiblings", type: "uint256[]" },
      { name: "points", type: "uint256[8]" },
    ],
    name: "castVoteAnonymous",
    outputs: [{ type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "targets", type: "address[]" },
      { name: "values", type: "uint256[]" },
      { name: "calldatas", type: "bytes[]" },
      { name: "descriptionHash", type: "bytes32" },
    ],
    name: "hashProposal",
    outputs: [{ type: "uint256" }],
    stateMutability: "pure",
    type: "function",
  },
] as const;

export const SEMAPHORE_GROUPS_ABI = [
  {
    inputs: [{ name: "groupId", type: "uint256" }],
    name: "getMerkleTreeRoot",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "groupId", type: "uint256" }],
    name: "getMerkleTreeDepth",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "groupId", type: "uint256" }],
    name: "getMerkleTreeSize",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Helper Types
export type CitizenApplication = {
  id: string;
  identityCommitment: string;
  applicantAddress: string;
  fullName: string;
  email: string;
  address: string;
  idNumber: string;
  documents: {
    idPhoto?: string;
    utilityBill?: string;
    additionalDocs?: string[];
  };
  status: ApplicationStatus;
  submittedAt: number;
  reviewedAt?: number;
  reviewedBy?: string;
  rejectionReason?: string;
};

export type ProposalData = {
  id: string;
  proposalId: bigint;
  title: string;
  description: string;
  targets: string[];
  values: bigint[];
  calldatas: string[];
  state: ProposalState;
  forVotes: bigint;
  againstVotes: bigint;
  abstainVotes: bigint;
  createdAt: number;
  startBlock?: bigint;
  endBlock?: bigint;
};

// Admin Addresses (you can add multiple admins here)
export const ADMIN_ADDRESSES: readonly string[] = [
  // Add your admin wallet addresses here
  // Example: "0xYourAdminAddress",
];

// Helper function to check if address is admin
export function isAdmin(address: string | undefined): boolean {
  if (!address) return false;
  return ADMIN_ADDRESSES.includes(address);
}

// Export everything for easy imports
const semaphoreConfig = {
  CONTRACTS,
  CITIZEN_GROUP_ID,
  NETWORK,
  GOVERNANCE_CONFIG,
  SNARK_FIELD_SIZE,
  STORAGE_KEYS,
  ApplicationStatus,
  ProposalState,
  VoteSupport,
  isAdmin,
};

export default semaphoreConfig;
