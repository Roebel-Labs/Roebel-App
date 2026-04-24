import { getContract } from "thirdweb";
import { client } from "@/app/client";
import { base } from "thirdweb/chains";

// OLD contract addresses (for reference/migration)
export const OLD_NFT_CONTRACT_ADDRESS = "0x976966e2669b3bF3c99B38cA4259a864f85191A1";
export const OLD_GOVERNOR_CONTRACT_ADDRESS = "0x767f7b996E54248F88944DAc344Ab74e93E21cdB";

// NEW Röbel/Müritz DAO contract addresses (Base Mainnet) - 1 Attester + 1 Citizen rule
export const CITIZEN_NFT_ADDRESS = "0xe2d39ffd2ee0Ccd753486047AEBec031F334b5b7"; // CitizenNFT (1+1 rule)
export const ATTESTER_GOVERNOR_ADDRESS = "0x84D8ab0FcA4D0689e2E3F036dc461942343c2a5b"; // AttesterGovernor (1h voting, 10% quorum)

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
