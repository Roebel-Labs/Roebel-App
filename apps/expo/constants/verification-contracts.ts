/**
 * Verification System Contract Configuration
 *
 * Smart contract addresses and ABIs for the HomeTown DAO Verification System
 */

import { getContract } from 'thirdweb';
import { client } from '@/constants/thirdweb';
import { gnosis } from '@/constants/gnosis';

// Deployed contract addresses on Gnosis v2 Mainnet (chainId 100, Sybil-hardening
// rotation 2026-06). CitizenNFTv2 / AttesterNFTv2 use dynamic percentage-band
// approval/rejection thresholds rather than a fixed 1+1.
export const VERIFICATION_CONTRACTS = {
  attesterNFT: process.env.NEXT_PUBLIC_ATTESTER_NFT || '0xC587F383696D3c9DF7A6eE03A9160E40Ae1cdb82',
  citizenNFT: process.env.NEXT_PUBLIC_CITIZEN_NFT || '0x59aA26f499D7C2B3EC2c8524Ed06F54fc4E85dE5',
  governor: process.env.NEXT_PUBLIC_GOVERNOR || '0x140F0eC647E9eBF9AbD293A7976edBc7d8C2dB65',
};

// Contract instances (Gnosis v2)
export const attesterNFTContract = getContract({
  client,
  address: VERIFICATION_CONTRACTS.attesterNFT,
  chain: gnosis,
});

export const citizenNFTContract = getContract({
  client,
  address: VERIFICATION_CONTRACTS.citizenNFT,
  chain: gnosis,
});

export const governorContract = getContract({
  client,
  address: VERIFICATION_CONTRACTS.governor,
  chain: gnosis,
});

// DEPRECATED on Gnosis v2: thresholds are now dynamic percentage-bands, not a
// fixed 1+1. Do NOT use these constants to DISPLAY how many signatures a request
// needs — read it per-request on-chain instead:
//   CitizenNFTv2.requiredAttesterApprovalsFor(requestId)
//   CitizenNFTv2.requiredCitizenApprovalsFor(requestId)
//   CitizenNFTv2.requiredAttesterRejectionsFor(requestId)
//   CitizenNFTv2.requiredCitizenRejectionsFor(requestId)
//   AttesterNFTv2.requiredApprovalsFor(requestId) / requiredRejectionsFor(requestId)
// Kept only so legacy references compile.
// TODO(gnosis-v2): read requiredAttesterApprovalsFor / requiredCitizenApprovalsFor
export const SIGNATURE_REQUIREMENTS = {
  citizen: {
    attesters: 1,
    citizens: 1,
    minimumApprovers: 2,
  },
  attester: {
    attesters: 2,
  },
  revocation: {
    attesters: 1,
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
  'function getRequestRejections(uint256 requestId) view returns (uint256)',
  'function hasApprovedRequest(uint256 requestId, address approver) view returns (bool)',
  'function hasRejectedRequest(uint256 requestId, address rejector) view returns (bool)',
  'function hasAttesterNFT(address account) view returns (bool)',
  'function requestCount() view returns (uint256)',
  // AttesterNFTv2: dynamic percentage-band thresholds, read per-request.
  'function requiredApprovalsFor(uint256 requestId) view returns (uint256)',
  'function requiredRejectionsFor(uint256 requestId) view returns (uint256)',
  'function attesterCount() view returns (uint256)',
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
  'function rejectRequest(uint256 requestId, bool signAsAttester)',
  'function getRequest(uint256 requestId) view returns (address requester, address target, uint8 requestType, uint8 status, string evidenceURI, uint256 attesterSignatures, uint256 citizenSignatures, uint256 createdAt)',
  'function getRequestRejections(uint256 requestId) view returns (uint256 attesterRejections, uint256 citizenRejections)',
  'function hasApprovedRequest(uint256 requestId, address approver) view returns (bool)',
  'function hasRejectedRequest(uint256 requestId, address rejector) view returns (bool)',
  'function hasCitizenNFT(address account) view returns (bool)',
  'function requestCount() view returns (uint256)',
  // CitizenNFTv2: dynamic percentage-band thresholds, read per-request.
  'function requiredAttesterApprovalsFor(uint256 requestId) view returns (uint256)',
  'function requiredCitizenApprovalsFor(uint256 requestId) view returns (uint256)',
  'function requiredAttesterRejectionsFor(uint256 requestId) view returns (uint256)',
  'function requiredCitizenRejectionsFor(uint256 requestId) view returns (uint256)',
  'function isActive(address account) view returns (bool)',
  'function citizenCount() view returns (uint256)',
  'function validUntil(address) view returns (uint64)',
  'event AttestationRequestCreated(uint256 indexed requestId, address indexed target, string evidenceURI)',
  'event RevocationRequestCreated(uint256 indexed requestId, address indexed target, string evidenceURI)',
  // v2 dropped the isAttester/isCitizen booleans — only signedAsAttester remains.
  'event RequestApproved(uint256 indexed requestId, address indexed approver, bool signedAsAttester)',
  'event RequestRejected(uint256 indexed requestId, address indexed rejector, bool signedAsAttester)',
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
