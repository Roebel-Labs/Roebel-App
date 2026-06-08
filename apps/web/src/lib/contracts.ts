import { getContract } from "thirdweb";
import { client } from "@/app/client";
import { base } from "thirdweb/chains";

// OLD contract addresses (for reference/migration)
export const OLD_NFT_CONTRACT_ADDRESS = "0x976966e2669b3bF3c99B38cA4259a864f85191A1";
export const OLD_GOVERNOR_CONTRACT_ADDRESS = "0x767f7b996E54248F88944DAc344Ab74e93E21cdB";

// Röbel/Müritz DAO contracts (Base Mainnet) — rotated 2026-05-23 to add
// governance-mutable thresholds, 1+1 CitizenNFT revocation, and Bug A/B/C fixes.
export const CITIZEN_NFT_ADDRESS = "0x7eF8308129C47E31415BEfC210aCEbD8ae6861BB";
export const ATTESTER_NFT_ADDRESS = "0x79B837b269f3EB3FB1c5856fE1E21675F05a3aFb";

// Legacy public-vote AttesterGovernor — kept for historical proposals only.
export const LEGACY_ATTESTER_GOVERNOR_ADDRESS = "0x84D8ab0FcA4D0689e2E3F036dc461942343c2a5b";

// Current MACI v2 privacy-voting governor — proposal creation + voting target.
// Rotated 2026-05-24 with a NEW MACI core (the prior MACI was permanently bound
// to the old gatekeeper, breaking signup for NEW CitizenNFT holders) and a 1-hour
// voting period (was 7 days).
// Source of truth: contracts/governor-contract/deployments/base.json
export const MACI_GOVERNOR_ADDRESS = "0xCd3b0feEE7C7dAEf7976A46627E5a6fE310A4F91";
export const MACI_ADDRESS = "0x76e0097D2F1e0D747B3dd58622c76b278e2f587a";

// Convenience aliases — existing imports keep working but now point at the
// new MACI Governor.
export const ATTESTER_GOVERNOR_ADDRESS = MACI_GOVERNOR_ADDRESS;
export const NFT_CONTRACT_ADDRESS = CITIZEN_NFT_ADDRESS;
export const GOVERNOR_CONTRACT_ADDRESS = MACI_GOVERNOR_ADDRESS;

// Contract instances
export const nftContract = getContract({
  client,
  chain: base,
  address: CITIZEN_NFT_ADDRESS,
});

export const governorContract = getContract({
  client,
  chain: base,
  address: MACI_GOVERNOR_ADDRESS,
});

export const legacyGovernorContract = getContract({
  client,
  chain: base,
  address: LEGACY_ATTESTER_GOVERNOR_ADDRESS,
});

export const maciContract = getContract({
  client,
  chain: base,
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
