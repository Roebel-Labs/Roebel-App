// Shared blockchain utilities for the Roebel monorepo

// Contract addresses deployed on Base Mainnet.
//
// Two governance regimes coexist:
//   1. Legacy public-vote AttesterGovernor (kept on chain for proposal history)
//   2. Current MACI v2 privacy-voting governor (apps target this for new proposals + votes)
export const CONTRACTS = {
  // Identity NFTs (unchanged across regimes)
  attesterNFT: "0xa06F09Cb406880512326318fbC09Cdb28631DA73",
  citizenNFT: "0xe2d39ffd2ee0Ccd753486047AEBec031F334b5b7",

  // Legacy public-vote governance (read-only — old proposals still resolve here)
  legacyAttesterGovernor: "0x84D8ab0FcA4D0689e2E3F036dc461942343c2a5b",
  legacyTimelock: "0xed1680AFf2A4235421b209A1bf8C7f5760149cc0",

  // Current MACI v2 privacy-voting governance (apps target this)
  maciAttesterGovernor: "0x5983F6300bCE3D9C1336a858Bd73F259bB8330F3",
  maciTimelock: "0xD1d6d0c8fd4D232D810FF920c802d748537E14Fe",

  // MACI v2 infrastructure (MACI core, Verifier, gatekeeper, voice credit
  // proxy reused; VkRegistry rotated 2026-05-08 (twice) to align all four
  // tree depths with the production-ceremony zKey signatures
  // ProcessMessagesNonQv_14-9-2-3 + TallyVotesNonQv_14-5-3.
  maci: "0x2922e42945a10d1F765E3f9Cab136421d4556D30",
  maciVerifier: "0x6682A865C9e2cAAC89DAAAdf25e15bc90db482D8",
  maciVkRegistry: "0xd6EF1Ad8cCAFC41bf025efe620e27d8CF18B91ED",
  maciGatekeeper: "0xbf79Fc06C304058cA77Bb718b21D183843e6c8ee",
  maciVoiceCreditProxy: "0x5b358A77E89FF3d699607b4fC235b381d67f3d05",

  // Off-chain coordinator EOA (Fly.io, decrypts ballots + posts ZK tally proof)
  maciCoordinator: "0x5e6528D22283Daf1E4340B39d48a4D3CeaDC184C",

  // Even-more-legacy (pre-Roebel-monorepo deployments — historical)
  legacyNFT: "0xc49003E2b834ee10CADa6bcf3b369C7b9E01d7cd",
  legacyGovernor: "0xBa4d0DD1a0e4bF8B08e8eF39FcaEA16F9CDDb90B",
} as const;

// Coordinator's BabyJubjub public key on the secp256k1-cousin curve used by MACI.
// Used by clients to ECDH-encrypt vote messages so only the coordinator can decrypt them.
// (`x`, `y`) point — both decimal-string bigints to avoid JS precision loss.
export const MACI_COORDINATOR_PUBKEY = {
  x: "17750760918337237068203925046126855078152981024548838042861633066128051663100",
  y: "8008521168745136880197848799504037322059936483887225034222289791088387810436",
} as const;

// MACI poll parameters baked into the deployed VkRegistry's verifying keys.
// Matches the production-ceremony zKey signatures:
//   ProcessMessagesNonQv(14, 9, 2, 3) → msgTreeDepth=9, msgBatchDepth=2
//   TallyVotesNonQv     (14, 5, 3)    → intStateTreeDepth=5
// Source of truth: the circuit templates in maci-circuits, mirrored into
// contracts/governor-contract/scripts/deploy-maci-base.cjs.
export const MACI_TREE_DEPTHS = {
  stateTreeDepth: 14,
  intStateTreeDepth: 5,
  messageTreeSubDepth: 2,
  messageTreeDepth: 9,
  voteOptionTreeDepth: 3,
  messageBatchSize: 25,
} as const;

export const MACI_VOTE_OPTIONS = {
  Against: 0,
  For: 1,
  Abstain: 2,
} as const;

export type MaciVoteOption = (typeof MACI_VOTE_OPTIONS)[keyof typeof MACI_VOTE_OPTIONS];

// Base chain ID
export const CHAIN_ID = 8453;
