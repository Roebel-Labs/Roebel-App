/**
 * Verification System Type Definitions
 *
 * Types for the HomeTown DAO Citizen/Attester Verification System
 */

/**
 * Personal data interface (encrypted in storage)
 */
export interface PersonalData {
  name: string;
  address: string;
}

/**
 * Encrypted blob structure
 */
export interface EncryptedBlob {
  ciphertext: string; // Base64 encrypted data
  nonce: string; // Base64 nonce (required for decryption)
}

/**
 * Public metadata structure (never encrypted)
 */
export interface PublicMetadata {
  reason: string;
  timestamp: string;
  type: 'citizen' | 'attester';
  requester: string;
  encrypted: boolean;
  encryptionTimestamp?: number; // DEPRECATED: V1 only - For deterministic key derivation
  encryptionVersion?: string; // 'eip712-v1' (signature-based) or 'eip712-v2' (wallet-based)
  encryptedKey?: string; // V2 only: Base64 encrypted data key
  keyNonce?: string; // V2 only: Base64 nonce for key encryption
}

/**
 * Complete evidence structure
 */
export interface EncryptedEvidence {
  encrypted: EncryptedBlob;
  metadata: PublicMetadata;
}

/**
 * Key derivation result
 */
export interface KeyDerivationResult {
  key: Uint8Array;
  timestamp: number;
}

/**
 * Session key result (for V2 encryption)
 */
export interface SessionKeyResult {
  sessionKey: Uint8Array; // One-time key derived from wallet address
  encryptedDataKey: string; // Base64 encrypted data key
  keyNonce: string; // Base64 nonce for key encryption
  dataKey: Uint8Array; // Random data key for encrypting actual data
}

/**
 * Request type enum (matches smart contract)
 */
export enum RequestType {
  Attestation = 0,
  Revocation = 1,
}

/**
 * Request status enum (matches smart contract)
 */
export enum RequestStatus {
  Pending = 0,
  Approved = 1,
  Rejected = 2,
  Executed = 3,
}

/**
 * Request data from blockchain (CitizenNFT)
 */
export interface CitizenRequest {
  id: number;
  requester: string;
  target: string;
  requestType: RequestType;
  status: RequestStatus;
  evidenceURI: string;
  attesterSignatures: number;
  citizenSignatures: number;
  createdAt: number; // Unix timestamp
}

/**
 * Request data from blockchain (AttesterNFT)
 */
export interface AttesterRequest {
  id: number;
  requester: string;
  target: string;
  requestType: RequestType;
  status: RequestStatus;
  evidenceURI: string;
  signatureCount: number;
  createdAt: number; // Unix timestamp
}

/**
 * Combined request type for UI
 */
export interface VerificationRequest {
  id: number;
  requester: string;
  target: string;
  requestType: RequestType;
  status: RequestStatus;
  evidenceURI: string;
  attesterSignatures: number;
  citizenSignatures: number;
  createdAt: number;
  nftType: 'citizen' | 'attester';
  // Loaded from Supabase
  evidence?: EncryptedEvidence;
  decryptedData?: PersonalData;
}

/**
 * User NFT status
 */
export interface NFTStatus {
  hasCitizenNFT: boolean;
  hasAttesterNFT: boolean;
  isLoading: boolean;
}

/**
 * QR Code data structure
 */
export interface VerificationQRData {
  requestId: number;
  nftType: 'citizen' | 'attester';
  requester: string;
  timestamp: number;
}
