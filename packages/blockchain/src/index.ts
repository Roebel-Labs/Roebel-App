// Shared blockchain utilities for the Roebel monorepo

// Contract addresses deployed on Base Mainnet
export const CONTRACTS = {
  attesterNFT: "0x9b6cc0f9BC74E0a64f662028C4CF52e00bD35D4f",
  citizenNFT: "0x78C88B01664Df4AA2F026DA68e834B4f33a3d751",
  governor: "0x572c97329ACaCBeBA74e28E3998674E9058A095a",

  // Legacy addresses
  legacyNFT: "0xc49003E2b834ee10CADa6bcf3b369C7b9E01d7cd",
  legacyGovernor: "0xBa4d0DD1a0e4bF8B08e8eF39FcaEA16F9CDDb90B",
} as const;

// Base chain ID
export const CHAIN_ID = 8453;
