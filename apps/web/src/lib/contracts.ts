import { getContract } from "thirdweb";
import { client } from "@/app/client";
import { base } from "thirdweb/chains";
import { gnosis } from "@/lib/gnosis";

// OLD contract addresses (for reference/migration)
export const OLD_NFT_CONTRACT_ADDRESS = "0x976966e2669b3bF3c99B38cA4259a864f85191A1";
export const OLD_GOVERNOR_CONTRACT_ADDRESS = "0x767f7b996E54248F88944DAc344Ab74e93E21cdB";

// Röbel/Müritz DAO contracts (Gnosis mainnet, chainId 100) — v2 Sybil-hardened
// rotation 2026-06-25: scale-aware %-band thresholds, per-request approval
// getters, isActive/validUntil/citizenCount/attesterCount views.
// Source of truth: contracts/governor-contract/deployments/gnosis-v2.json
export const CITIZEN_NFT_ADDRESS = "0x59aA26f499D7C2B3EC2c8524Ed06F54fc4E85dE5";
export const ATTESTER_NFT_ADDRESS = "0xC587F383696D3c9DF7A6eE03A9160E40Ae1cdb82";

// Legacy public-vote AttesterGovernor (Base) — kept for historical proposals only.
// Stays on Base because this contract was never deployed on Gnosis.
export const LEGACY_ATTESTER_GOVERNOR_ADDRESS = "0x84D8ab0FcA4D0689e2E3F036dc461942343c2a5b";

// Current MACI v2 privacy-voting governor on Gnosis — proposal creation + voting target.
export const MACI_GOVERNOR_ADDRESS = "0xDC2503152068FBE2a848df65f5b671c1e84A4159";
export const MACI_ADDRESS = "0x6663eDC8650276fe264710B1A2ba46eB8bd0bF1D";

// Pre-Gnosis-v2 active Base addresses (archived for historical lookups; preserved
// per the cutover — do not delete). These were the live set before 2026-06-25.
export const LEGACY_BASE_CITIZEN_NFT_ADDRESS = "0x7eF8308129C47E31415BEfC210aCEbD8ae6861BB";
export const LEGACY_BASE_ATTESTER_NFT_ADDRESS = "0x79B837b269f3EB3FB1c5856fE1E21675F05a3aFb";
export const LEGACY_BASE_MACI_GOVERNOR_ADDRESS = "0xCd3b0feEE7C7dAEf7976A46627E5a6fE310A4F91";
export const LEGACY_BASE_MACI_ADDRESS = "0x76e0097D2F1e0D747B3dd58622c76b278e2f587a";

// Convenience aliases — existing imports keep working but now point at the
// new MACI Governor.
export const ATTESTER_GOVERNOR_ADDRESS = MACI_GOVERNOR_ADDRESS;
export const NFT_CONTRACT_ADDRESS = CITIZEN_NFT_ADDRESS;
export const GOVERNOR_CONTRACT_ADDRESS = MACI_GOVERNOR_ADDRESS;

// Contract instances
export const nftContract = getContract({
  client,
  chain: gnosis,
  address: CITIZEN_NFT_ADDRESS,
});

export const governorContract = getContract({
  client,
  chain: gnosis,
  address: MACI_GOVERNOR_ADDRESS,
});

// Legacy Base public-vote governor — kept on Base (read-only historical lookups).
export const legacyGovernorContract = getContract({
  client,
  chain: base,
  address: LEGACY_ATTESTER_GOVERNOR_ADDRESS,
});

export const maciContract = getContract({
  client,
  chain: gnosis,
  address: MACI_ADDRESS,
});

// Proposal states mapping
export enum ProposalState {
  Pending = 0,
  Active = 1,
  Canceled = 2,
  Defeated = 3,
  Succeeded = 4,
  Queued = 5,
  Expired = 6,
  Executed = 7,
}

export const getProposalStateLabel = (state: ProposalState): string => {
  const labels = {
    [ProposalState.Pending]: "Pending",
    [ProposalState.Active]: "Active",
    [ProposalState.Canceled]: "Canceled",
    [ProposalState.Defeated]: "Defeated",
    [ProposalState.Succeeded]: "Succeeded",
    [ProposalState.Queued]: "Queued",
    [ProposalState.Expired]: "Expired",
    [ProposalState.Executed]: "Executed",
  };
  return labels[state] || "Unknown";
};

// Vote types
export enum VoteType {
  Against = 0,
  For = 1,
  Abstain = 2,
}
