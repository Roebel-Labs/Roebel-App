import { gnosis } from "@/lib/gnosis";

// Primary chain for the DAO — migrated to Gnosis (chainId 100) for the
// v2 Sybil-hardened identity/MACI stack (2026-06-25).
export const activeChain = gnosis;

// Chain configuration
export const CHAIN_CONFIG = {
  name: "Gnosis",
  chainId: 100,
  blockExplorer: "https://gnosisscan.io",
};
