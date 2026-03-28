/**
 * Verification System Contract Configuration
 *
 * Smart contract addresses and ABIs for the HomeTown DAO Verification System
 */

import { getContract } from 'thirdweb';
import { client } from '@/constants/thirdweb';
import { base } from 'thirdweb/chains';

// Deployed contract addresses on Base Mainnet
export const VERIFICATION_CONTRACTS = {
  attesterNFT: process.env.NEXT_PUBLIC_ATTESTER_NFT || '0x9b6cc0f9BC74E0a64f662028C4CF52e00bD35D4f',
  citizenNFT: process.env.NEXT_PUBLIC_CITIZEN_NFT || '0x78C88B01664Df4AA2F026DA68e834B4f33a3d751',
  governor: process.env.NEXT_PUBLIC_GOVERNOR || '0x572c97329ACaCBeBA74e28E3998674E9058A095a',
};

// Contract instances
export const attesterNFTContract = getContract({
  client,
  address: VERIFICATION_CONTRACTS.attesterNFT,
  chain: base,
});

export const citizenNFTContract = getContract({
  client,
  address: VERIFICATION_CONTRACTS.citizenNFT,
  chain: base,
});

export const governorContract = getContract({
  client,
  address: VERIFICATION_CONTRACTS.governor,
  chain: base,
});

// Signature requirements
export const SIGNATURE_REQUIREMENTS = {
  citizen: {
    attesters: 1,
    citizens: 2,
    minimumApprovers: 3,
  },
  attester: {
    attesters: 3,
  },
  revocation: {
    attesters: 3,
  },
};

/**
 * Contract ABIs
 * Minimal required functions for the verification system
 */

export const ATTESTER_NFT_ABI = [
  'function createAttestationRequest(string evidenceURI) returns (uint256)',
  'function createRevocationRequest(address target, string evidenceURI)',
  'function approveRequest(uint256 requestId)',
  'function rejectRequest(uint256 requestId)',
  'function getRequest(uint256 requestId) view returns (address requester, address target, uint8 requestType, uint8 status, string evidenceURI, uint256 signatureCount, uint256 createdAt)',
  'function hasApprovedRequest(uint256 requestId, address approver) view returns (bool)',
  'function hasRejectedRequest(uint256 requestId, address rejector) view returns (bool)',
  'function hasAttesterNFT(address account) view returns (bool)',
  'function requestCount() view returns (uint256)',
  'event AttestationRequestCreated(uint256 indexed requestId, address indexed target, string evidenceURI)',
  'event RevocationRequestCreated(uint256 indexed requestId, address indexed target, string evidenceURI)',
  'event RequestApproved(uint256 indexed requestId, address indexed approver)',
  'event RequestRejected(uint256 indexed requestId, address indexed rejector)',
  'event AttesterNFTMinted(address indexed attester, uint256 indexed tokenId, uint256 indexed requestId)',
  'event AttesterNFTRevoked(address indexed attester, uint256 indexed tokenId, uint256 indexed requestId)',
] as const;

export const CITIZEN_NFT_ABI = [
  'function createAttestationRequest(string evidenceURI) returns (uint256)',
  'function createRevocationRequest(address target, string evidenceURI)',
  'function approveRequest(uint256 requestId, bool signAsAttester)',
  'function rejectRequest(uint256 requestId)',
  'function getRequest(uint256 requestId) view returns (address requester, address target, uint8 requestType, uint8 status, string evidenceURI, uint256 attesterSignatures, uint256 citizenSignatures, uint256 createdAt)',
  'function hasApprovedRequest(uint256 requestId, address approver) view returns (bool)',
  'function hasRejectedRequest(uint256 requestId, address rejector) view returns (bool)',
  'function hasCitizenNFT(address account) view returns (bool)',
  'function requestCount() view returns (uint256)',
  'event AttestationRequestCreated(uint256 indexed requestId, address indexed target, string evidenceURI)',
  'event RevocationRequestCreated(uint256 indexed requestId, address indexed target, string evidenceURI)',
  'event RequestApproved(uint256 indexed requestId, address indexed approver, bool isAttester, bool isCitizen, bool signedAsAttester)',
  'event RequestRejected(uint256 indexed requestId, address indexed rejector)',
  'event CitizenNFTMinted(address indexed citizen, uint256 indexed tokenId, uint256 indexed requestId)',
  'event CitizenNFTRevoked(address indexed citizen, uint256 indexed tokenId, uint256 indexed requestId)',
] as const;

export const GOVERNOR_ABI = [
  'function propose(address[] targets, uint256[] values, bytes[] calldatas, string description) returns (uint256)',
  'function castVote(uint256 proposalId, uint8 support) returns (uint256)',
  'function execute(address[] targets, uint256[] values, bytes[] calldatas, bytes32 descriptionHash) returns (uint256)',
  'function state(uint256 proposalId) view returns (uint8)',
  'function canPropose(address account) view returns (bool)',
  'function proposalVotes(uint256 proposalId) view returns (uint256 againstVotes, uint256 forVotes, uint256 abstainVotes)',
  'function hasVoted(uint256 proposalId, address account) view returns (bool)',
  'function quorum(uint256 blockNumber) view returns (uint256)',
  'function votingDelay() view returns (uint256)',
  'function votingPeriod() view returns (uint256)',
  'event ProposalCreated(uint256 proposalId, address proposer, address[] targets, uint256[] values, string[] signatures, bytes[] calldatas, uint256 voteStart, uint256 voteEnd, string description)',
  'event ProposalCreatedByAttester(uint256 indexed proposalId, address indexed attester, string description)',
  'event VoteCast(address indexed voter, uint256 proposalId, uint8 support, uint256 weight, string reason)',
] as const;
