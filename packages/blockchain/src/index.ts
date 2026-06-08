// Shared blockchain utilities for the Roebel monorepo

// Contract addresses deployed on Base Mainnet.
//
// Two governance regimes coexist:
//   1. Legacy public-vote AttesterGovernor (kept on chain for proposal history)
//   2. Current MACI v2 privacy-voting governor (apps target this for new proposals + votes)
export const CONTRACTS = {
  // Identity NFTs (rotated 2026-05-23: governance-mutable thresholds, 1+1
  // revocation, O(1) burn lookup, multi-sig rejection — see commit 08bd7e7).
  // Owned by maciTimelock.
  attesterNFT: "0x79B837b269f3EB3FB1c5856fE1E21675F05a3aFb",
  citizenNFT: "0x7eF8308129C47E31415BEfC210aCEbD8ae6861BB",

  // Legacy public-vote governance (read-only — old proposals still resolve here)
  legacyAttesterGovernor: "0x84D8ab0FcA4D0689e2E3F036dc461942343c2a5b",
  legacyTimelock: "0xed1680AFf2A4235421b209A1bf8C7f5760149cc0",

  // Current MACI v2 privacy-voting governance (apps target this).
  // Rotated 2026-05-24: NEW MACI core that actually binds to the new
  // gatekeeper (MACI's signUpGatekeeper is immutable, so the prior rotation's
  // gatekeeper swap was a no-op until MACI itself was redeployed). New
  // Governor + Timelock pair binds to this MACI. Voting period is now 1 h
  // (was 7 days).
  maciAttesterGovernor: "0xCd3b0feEE7C7dAEf7976A46627E5a6fE310A4F91",
  maciTimelock: "0xc93032B37Fb9409996a943978fFE26852B1c4368",

  // MACI v2 infrastructure. MACI core rotated 2026-05-24; Verifier + VkRegistry
  // + Poseidon + factories + voice credit proxy + gatekeeper all reused (their
  // state is independent of MACI core).
  maci: "0x76e0097D2F1e0D747B3dd58622c76b278e2f587a",
  maciVerifier: "0x6682A865C9e2cAAC89DAAAdf25e15bc90db482D8",
  maciVkRegistry: "0xd6EF1Ad8cCAFC41bf025efe620e27d8CF18B91ED",
  maciGatekeeper: "0xc767fa3bbd9f0934Fb419137d7b6506E44105f74",
  maciVoiceCreditProxy: "0x5b358A77E89FF3d699607b4fC235b381d67f3d05",

  // Archived (kept for historical proposal/revocation lookups)
  legacyAttesterNFT: "0xa06F09Cb406880512326318fbC09Cdb28631DA73",
  legacyCitizenNFT: "0xe2d39ffd2ee0Ccd753486047AEBec031F334b5b7",
  legacyMaciAttesterGovernor: "0x5983F6300bCE3D9C1336a858Bd73F259bB8330F3",
  legacyMaciTimelock: "0xD1d6d0c8fd4D232D810FF920c802d748537E14Fe",
  legacyMaciGatekeeper: "0xbf79Fc06C304058cA77Bb718b21D183843e6c8ee",
  // 2026-05-23 rotation that fixed NFT thresholds but missed the MACI signup
  // gatekeeper binding. Still owns AttesterNFT + CitizenNFT (NFT threshold
  // changes require a proposal on this Governor, not the current one).
  legacy2MaciAttesterGovernor: "0xb5333aFf2A0015aF0d58C0f92c826Fc503e63177",
  legacy2MaciTimelock: "0xe8B8149F9373a56F55112e5Fc867E58308D014c1",
  // Pre-2026-05-24 MACI core (the one that was permanently bound to the OLD
  // gatekeeper, breaking signup for NEW CitizenNFT holders).
  legacyMaci: "0x2922e42945a10d1F765E3f9Cab136421d4556D30",

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
