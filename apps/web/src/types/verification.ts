/**
 * Types for the Verification System
 */

// Request types
export enum RequestType {
  Attestation = 0,
  Revocation = 1,
}

export enum RequestStatus {
  Pending = 0,
  Approved = 1,
  Rejected = 2,
  Executed = 3,
}

// NFT types
export enum NFTType {
  Attester = "attester",
  Citizen = "citizen",
}

// Personal data (encrypted)
export interface PersonalData {
  name: string;
  address: string;
}

// Encrypted blob structure
export interface EncryptedBlob {
  ciphertext: string; // Base64
  nonce: string; // Base64
}

// Public metadata (never encrypted)
export interface PublicMetadata {
  reason: string;
  timestamp: string;
  type: string;
  requester: string;
  encrypted: boolean;
  encryptionTimestamp?: number; // For deterministic key derivation (EIP-712)
  encryptionVersion?: string; // Version of encryption algorithm ('eip712-v1')
}

// Encrypted evidence structure
export interface EncryptedEvidence {
  encrypted: EncryptedBlob;
  metadata: PublicMetadata;
}

// Legacy evidence structure (backward compatibility - stored on IPFS)
export interface LegacyEvidence {
  name: string;
  address: string;
  reason: string;
  date: string; // ISO 8601 format
}

// Evidence union type (supports both encrypted and legacy)
export type Evidence = EncryptedEvidence | LegacyEvidence;

// Attester request (from smart contract)
export interface AttesterRequest {
  id: number;
  requester: string;
  target: string;
  requestType: RequestType;
  status: RequestStatus;
  evidenceURI: string;
  signatureCount: number;
  createdAt: number; // timestamp
}

// Citizen request (from smart contract)
export interface CitizenRequest {
  id: number;
  requester: string;
  target: string;
  requestType: RequestType;
  status: RequestStatus;
  evidenceURI: string;
  attesterSignatures: number;
  citizenSignatures: number;
  createdAt: number; // timestamp
}

// Combined request with evidence
export interface RequestWithEvidence {
  request: AttesterRequest | CitizenRequest;
  evidence: Evidence | null;
  nftType: NFTType;
  hasUserApproved: boolean;
  hasUserRejected: boolean;
  canApprove: boolean; // User is eligible to approve
  isEncrypted?: boolean; // Flag for encrypted evidence
  isOwner?: boolean; // True if current user is evidence creator
}

// User verification status
export interface VerificationStatus {
  hasAttesterNFT: boolean;
  hasCitizenNFT: boolean;
  canCreateAttesterRequest: boolean;
  canCreateCitizenRequest: boolean;
  canApproveAttesterRequests: boolean;
  canApproveCitizenRequests: boolean;
}

// Statistics for admin panel
export interface VerificationStats {
  totalAttesters: number;
  totalCitizens: number;
  pendingAttesterRequests: number;
  pendingCitizenRequests: number;
  totalRequests: number;
}
