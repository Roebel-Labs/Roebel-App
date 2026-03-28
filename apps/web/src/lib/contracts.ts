import { getContract } from "thirdweb";
import { client } from "@/app/client";
import { base } from "thirdweb/chains";

// OLD contract addresses (for reference/migration)
export const OLD_NFT_CONTRACT_ADDRESS = "0x976966e2669b3bF3c99B38cA4259a864f85191A1";
export const OLD_GOVERNOR_CONTRACT_ADDRESS = "0x767f7b996E54248F88944DAc344Ab74e93E21cdB";

// NEW Röbel/Müritz DAO contract addresses (Base Mainnet) - With Auto-Delegation
export const CITIZEN_NFT_ADDRESS = "0x78C88B01664Df4AA2F026DA68e834B4f33a3d751"; // CitizenNFT v3 (with auto-delegation)
export const ATTESTER_GOVERNOR_ADDRESS = "0x572c97329ACaCBeBA74e28E3998674E9058A095a"; // AttesterGovernor (1 day delay, 5 day period)

// Legacy exports (for compatibility with existing code)
export const NFT_CONTRACT_ADDRESS = CITIZEN_NFT_ADDRESS;
export const GOVERNOR_CONTRACT_ADDRESS = ATTESTER_GOVERNOR_ADDRESS;

// Contract instances - now using new Röbel/Müritz contracts
export const nftContract = getContract({
  client,
  chain: base,
  address: CITIZEN_NFT_ADDRESS,
});

export const governorContract = getContract({
  client,
  chain: base,
  address: ATTESTER_GOVERNOR_ADDRESS,
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
