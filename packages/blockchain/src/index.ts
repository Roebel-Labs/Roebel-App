// Shared blockchain utilities for the Roebel monorepo

// Contract addresses deployed on Base Mainnet
export const CONTRACTS = {
  attesterNFT: "0xa06F09Cb406880512326318fbC09Cdb28631DA73",
  citizenNFT: "0xe2d39ffd2ee0Ccd753486047AEBec031F334b5b7",
  governor: "0x84D8ab0FcA4D0689e2E3F036dc461942343c2a5b",

  // Legacy addresses
  legacyNFT: "0xc49003E2b834ee10CADa6bcf3b369C7b9E01d7cd",
  legacyGovernor: "0xBa4d0DD1a0e4bF8B08e8eF39FcaEA16F9CDDb90B",
} as const;

// Base chain ID
export const CHAIN_ID = 8453;
