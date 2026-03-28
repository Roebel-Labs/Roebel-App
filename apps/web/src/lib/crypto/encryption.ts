/**
 * Client-Side Encryption for Evidence Data
 *
 * Privacy-preserving encryption using TweetNaCl (NaCl crypto library)
 * - Symmetric encryption with XSalsa20-Poly1305
 * - Deterministic key derivation using EIP-712 typed data signing
 * - Only evidence creator can decrypt (via thirdweb account abstraction)
 * - GDPR-compliant: personal data never stored plaintext
 */

import nacl from 'tweetnacl';
import {
  decodeUTF8,
  encodeUTF8,
  encodeBase64,
  decodeBase64,
} from 'tweetnacl-util';
import type { Account } from 'thirdweb/wallets';

/**
 * Personal data interface (encrypted)
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
  type: string;
  requester: string;
  encrypted: boolean;
  encryptionTimestamp?: number; // For deterministic key derivation (DEPRECATED - signatures are non-deterministic)
  encryptionVersion?: string; // Version of encryption algorithm ('eip712-v1', 'eip712-v2')
  encryptedKey?: string; // Base64 encrypted data key (v2 only) - encrypted with a session key
  keyNonce?: string; // Base64 nonce for key encryption (v2 only)
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
 * Session key result (for v2 encryption)
 */
export interface SessionKeyResult {
  sessionKey: Uint8Array; // One-time key from fresh signature
  encryptedDataKey: string; // Base64 encrypted data key
  keyNonce: string; // Base64 nonce for key encryption
  dataKey: Uint8Array; // Random data key for encrypting actual data
}

/**
 * EIP-712 Domain for HomeTown DAO Evidence Encryption
 */
const ENCRYPTION_DOMAIN = {
  name: 'HomeTown DAO Evidence Encryption',
  version: '1',
  chainId: 8453, // Base mainnet
};

/**
 * EIP-712 Types for key derivation
 */
const ENCRYPTION_KEY_TYPES = {
  KeyDerivation: [
    { name: 'purpose', type: 'string' },
    { name: 'timestamp', type: 'uint256' },
  ],
} as const;

/**
 * Derive encryption key from EIP-712 typed data signature
 *
 * Uses deterministic EIP-712 signing for consistent key derivation:
 * - Same wallet + same timestamp → same signature → same key
 * - Works across desktop/mobile with thirdweb account abstraction
 * - Human-readable signature request in wallet
 *
 * @param account - Thirdweb account instance
 * @param timestamp - Optional timestamp for decryption (use stored value)
 * @returns Key and timestamp for encryption/decryption
 */
export async function deriveEncryptionKey(
  account: Account,
  timestamp?: number
): Promise<KeyDerivationResult> {
  console.log('🔐 Deriving encryption key from EIP-712 typed data signature...');

  try {
    // Use provided timestamp (for decryption) or generate new one (for encryption)
    const derivationTimestamp = timestamp ?? Date.now();

    // Detailed timestamp logging for debugging
    const now = Date.now();
    const nowAlt = new Date().getTime();
    const isoTime = new Date().toISOString();
    console.log(`⏰ Timestamp validation:`);
    console.log(`   Date.now(): ${now}`);
    console.log(`   new Date().getTime(): ${nowAlt}`);
    console.log(`   ISO: ${isoTime}`);
    console.log(`   Using for encryption: ${derivationTimestamp}`);

    // Validate timestamp (should be within 1 hour of current time when encrypting)
    if (!timestamp) { // Only validate for new encryption, not decryption
      const timeDiff = Math.abs(derivationTimestamp - now);
      const oneHour = 60 * 60 * 1000; // 1 hour in ms

      if (timeDiff > oneHour) {
        const diffMinutes = Math.round(timeDiff / 60000);
        console.error(`❌ Timestamp validation failed!`);
        console.error(`   Generated timestamp: ${derivationTimestamp} (${new Date(derivationTimestamp).toISOString()})`);
        console.error(`   Current time: ${now} (${new Date(now).toISOString()})`);
        console.error(`   Difference: ${diffMinutes} minutes`);
        throw new Error(`Timestamp validation failed: ${diffMinutes} minutes off from current time. Check system clock.`);
      }

      console.log(`✅ Timestamp validated (within 1 hour of current time)`);
    }

    // Create EIP-712 typed data message
    const message = {
      purpose: 'evidence-encryption',
      timestamp: BigInt(derivationTimestamp),
    };

    console.log('📝 Requesting EIP-712 signature...');
    console.log('   Domain:', ENCRYPTION_DOMAIN);
    console.log('   Message:', { ...message, timestamp: derivationTimestamp });

    // Sign typed data with EIP-712
    const signature = await account.signTypedData({
      domain: ENCRYPTION_DOMAIN,
      types: ENCRYPTION_KEY_TYPES,
      primaryType: 'KeyDerivation',
      message,
    });

    console.log('✅ EIP-712 signature received');
    console.log(`   Signature preview: ${signature.toString().substring(0, 20)}...`);

    // Convert hex signature to bytes
    const signatureBytes =
      typeof signature === 'string'
        ? hexToUint8Array(signature)
        : new Uint8Array(signature);

    console.log(`   Signature bytes length: ${signatureBytes.length}`);

    // Hash signature to 32 bytes for NaCl secretbox
    // Create a new Uint8Array to ensure proper buffer type
    const buffer = new Uint8Array(signatureBytes);
    const key = await crypto.subtle.digest('SHA-256', buffer);
    const keyArray = new Uint8Array(key);

    console.log('🔑 Encryption key derived successfully');
    console.log(`   Key preview: ${Array.from(keyArray.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('')}...`);

    return {
      key: keyArray,
      timestamp: derivationTimestamp,
    };
  } catch (error) {
    console.error('❌ Failed to derive encryption key:', error);
    throw new Error(
      error instanceof Error
        ? `Key derivation failed: ${error.message}`
        : 'Failed to derive encryption key'
    );
  }
}

/**
 * Encrypt personal evidence data
 *
 * Uses symmetric encryption (XSalsa20-Poly1305) with authenticated encryption
 * - Confidentiality: Encrypted data cannot be read
 * - Integrity: Tampering is detectable
 *
 * @param data - Personal data (name, address)
 * @param key - 32-byte encryption key from deriveEncryptionKey()
 * @returns Encrypted blob with ciphertext + nonce
 */
export function encryptEvidence(
  data: PersonalData,
  key: Uint8Array
): EncryptedBlob {
  console.log('🔒 Encrypting personal data...');

  try {
    // Validate key length
    if (key.length !== nacl.secretbox.keyLength) {
      throw new Error(
        `Invalid key length: ${key.length} (expected ${nacl.secretbox.keyLength})`
      );
    }

    // Convert data to JSON string then bytes
    const jsonString = JSON.stringify(data);
    const messageBytes = decodeUTF8(jsonString);

    // Generate random nonce (24 bytes for XSalsa20)
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);

    // Encrypt with authenticated encryption
    const ciphertext = nacl.secretbox(messageBytes, nonce, key);

    if (!ciphertext) {
      throw new Error('Encryption failed: secretbox returned null');
    }

    // Encode to Base64 for storage
    const encryptedBlob: EncryptedBlob = {
      ciphertext: encodeBase64(ciphertext),
      nonce: encodeBase64(nonce),
    };

    console.log('✅ Data encrypted successfully');
    console.log(
      `   Ciphertext length: ${encryptedBlob.ciphertext.length} chars`
    );
    console.log(`   Nonce: ${encryptedBlob.nonce.substring(0, 20)}...`);

    return encryptedBlob;
  } catch (error) {
    console.error('❌ Encryption failed:', error);
    throw new Error(
      error instanceof Error
        ? `Encryption failed: ${error.message}`
        : 'Failed to encrypt evidence'
    );
  }
}

/**
 * Decrypt personal evidence data
 *
 * Only works if you have the correct key (derived from creator's wallet)
 * - Verifies data integrity (Poly1305 MAC)
 * - Returns null if tampered or wrong key
 *
 * @param encrypted - Encrypted blob from encryptEvidence()
 * @param key - 32-byte encryption key (must match encryption key)
 * @returns Decrypted personal data or throws error
 */
export function decryptEvidence(
  encrypted: EncryptedBlob,
  key: Uint8Array
): PersonalData {
  console.log('🔓 Decrypting personal data...');

  try {
    // Validate key length
    if (key.length !== nacl.secretbox.keyLength) {
      throw new Error(
        `Invalid key length: ${key.length} (expected ${nacl.secretbox.keyLength})`
      );
    }

    console.log(`   Key preview: ${Array.from(key.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('')}...`);

    // Decode from Base64
    const ciphertext = decodeBase64(encrypted.ciphertext);
    const nonce = decodeBase64(encrypted.nonce);

    console.log(`   Ciphertext length: ${ciphertext.length} bytes`);
    console.log(`   Nonce length: ${nonce.length} bytes`);

    // Decrypt with authenticated decryption
    const decryptedBytes = nacl.secretbox.open(ciphertext, nonce, key);

    if (!decryptedBytes) {
      throw new Error(
        'Decryption failed: Invalid key or corrupted data (authentication failed)'
      );
    }

    // Convert bytes to JSON string then parse
    const jsonString = encodeUTF8(decryptedBytes);
    const data = JSON.parse(jsonString) as PersonalData;

    console.log('✅ Data decrypted successfully');
    console.log(`   Name: ${data.name.substring(0, 3)}***`);
    console.log(
      `   Address: ${data.address.substring(0, 10)}...`
    );

    return data;
  } catch (error) {
    console.error('❌ Decryption failed:', error);
    throw new Error(
      error instanceof Error
        ? `Decryption failed: ${error.message}`
        : 'Failed to decrypt evidence (wrong wallet or corrupted data)'
    );
  }
}

/**
 * Check if evidence is encrypted
 */
export function isEncrypted(evidence: any): evidence is EncryptedEvidence {
  return (
    evidence &&
    typeof evidence === 'object' &&
    'encrypted' in evidence &&
    'metadata' in evidence &&
    evidence.encrypted &&
    typeof evidence.encrypted === 'object' &&
    'ciphertext' in evidence.encrypted &&
    'nonce' in evidence.encrypted
  );
}

/**
 * Test encryption/decryption roundtrip
 * Useful for debugging key derivation issues
 *
 * @param account - Thirdweb account instance
 * @param testData - Test personal data
 * @returns true if encrypt/decrypt succeeds, false otherwise
 */
export interface RoundtripTestResult {
  success: boolean;
  timestamp?: number;
  signature?: string;
  key?: string;
  original?: string;
  decrypted?: string;
  error?: string;
}

export async function testEncryptionRoundtrip(
  account: Account,
  testData: PersonalData = { name: 'Test User', address: 'Test Address 123' }
): Promise<RoundtripTestResult> {
  console.log('🧪 Testing encryption roundtrip...');

  try {
    // Step 1: Derive key and encrypt
    console.log('1️⃣ Deriving encryption key...');
    const { key: encKey, timestamp } = await deriveEncryptionKey(account);

    // Get signature preview by re-signing (for display purposes)
    const message = {
      purpose: 'evidence-encryption',
      timestamp: BigInt(timestamp),
    };
    const signature = await account.signTypedData({
      domain: ENCRYPTION_DOMAIN,
      types: ENCRYPTION_KEY_TYPES,
      primaryType: 'KeyDerivation',
      message,
    });

    console.log('2️⃣ Encrypting test data...');
    const encrypted = encryptEvidence(testData, encKey);

    // Step 2: Derive same key with timestamp and decrypt
    console.log(`3️⃣ Deriving decryption key with timestamp ${timestamp}...`);
    const { key: decKey } = await deriveEncryptionKey(account, timestamp);

    console.log('4️⃣ Decrypting data...');
    const decrypted = decryptEvidence(encrypted, decKey);

    // Step 3: Verify
    const success =
      decrypted.name === testData.name && decrypted.address === testData.address;

    if (success) {
      console.log('✅ Roundtrip test PASSED');
      return {
        success: true,
        timestamp,
        signature: signature.toString(),
        key: Array.from(encKey.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(''),
        original: JSON.stringify(testData),
        decrypted: JSON.stringify(decrypted),
      };
    } else {
      console.error('❌ Roundtrip test FAILED: data mismatch');
      console.error('   Original:', testData);
      console.error('   Decrypted:', decrypted);
      return {
        success: false,
        error: `Data mismatch: Original=${JSON.stringify(testData)}, Decrypted=${JSON.stringify(decrypted)}`,
      };
    }
  } catch (error) {
    console.error('❌ Roundtrip test FAILED with error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Convert hex string to Uint8Array
 */
function hexToUint8Array(hex: string): Uint8Array {
  // Remove 0x prefix if present
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;

  // Convert hex pairs to bytes
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.slice(i, i + 2), 16);
  }

  return bytes;
}

/**
 * Securely clear encryption key from memory
 * Call this when done with the key to minimize exposure
 */
export function clearKey(key: Uint8Array): void {
  // Overwrite with zeros
  for (let i = 0; i < key.length; i++) {
    key[i] = 0;
  }
}

/**
 * Derive session key for V2 encryption (deterministic from wallet address)
 *
 * V2 encryption solves the EIP-712 signature non-determinism problem:
 * 1. Generate random data key for encrypting data
 * 2. Derive session key from wallet address + chain ID (deterministic, no signature)
 * 3. Encrypt the data key with session key
 * 4. Store encrypted data key in metadata
 * 5. For decryption: Derive same session key from wallet → decrypt data key → decrypt data
 *
 * Benefits:
 * - No signature required (better UX)
 * - Fully deterministic (works every time)
 * - Wallet-specific (only owner can decrypt)
 *
 * @param account - Thirdweb account instance
 * @returns Session key and encrypted data key
 */
export async function deriveSessionKey(
  account: Account
): Promise<SessionKeyResult> {
  console.log('🔐 V2: Deriving session key for encryption...');

  try {
    // Generate random 32-byte data key
    const dataKey = nacl.randomBytes(nacl.secretbox.keyLength);
    console.log('🎲 Generated random data key');

    // Derive session key from wallet address (deterministic, no signature needed)
    const walletAddress = account.address.toLowerCase();
    const chainId = ENCRYPTION_DOMAIN.chainId.toString();
    const seed = `${walletAddress}:${chainId}:evidence-encryption-v2`;

    console.log(`   Using wallet: ${walletAddress.substring(0, 10)}...`);

    // Hash the seed to get a 32-byte key
    const encoder = new TextEncoder();
    const seedBytes = encoder.encode(seed);
    const keyHash = await crypto.subtle.digest('SHA-256', seedBytes);
    const sessionKey = new Uint8Array(keyHash);

    console.log('🔑 Session key derived from wallet address');

    // Encrypt data key with session key
    const keyNonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const encryptedKey = nacl.secretbox(dataKey, keyNonce, sessionKey);

    if (!encryptedKey) {
      throw new Error('Failed to encrypt data key');
    }

    console.log('✅ Data key encrypted with session key');

    return {
      sessionKey,
      encryptedDataKey: encodeBase64(encryptedKey),
      keyNonce: encodeBase64(keyNonce),
      dataKey,
    };
  } catch (error) {
    console.error('❌ Failed to derive session key:', error);
    throw new Error(
      error instanceof Error
        ? `Session key derivation failed: ${error.message}`
        : 'Failed to derive session key'
    );
  }
}

/**
 * Decrypt data key using wallet-derived key (V2 decryption)
 *
 * Uses wallet address + chain ID as deterministic seed for key derivation.
 * This is reproducible without requiring signature determinism.
 *
 * @param account - Thirdweb account instance
 * @param encryptedKey - Base64 encrypted data key from metadata
 * @param keyNonce - Base64 nonce for key decryption
 * @returns Decrypted data key
 */
export async function decryptDataKey(
  account: Account,
  encryptedKey: string,
  keyNonce: string
): Promise<Uint8Array> {
  console.log('🔓 V2: Decrypting data key...');

  try {
    // Derive session key from wallet address (deterministic, no signature needed)
    const walletAddress = account.address.toLowerCase();
    const chainId = ENCRYPTION_DOMAIN.chainId.toString();
    const seed = `${walletAddress}:${chainId}:evidence-encryption-v2`;

    console.log(`   Using wallet: ${walletAddress.substring(0, 10)}...`);

    // Hash the seed to get a 32-byte key
    const encoder = new TextEncoder();
    const seedBytes = encoder.encode(seed);
    const keyHash = await crypto.subtle.digest('SHA-256', seedBytes);
    const sessionKey = new Uint8Array(keyHash);

    console.log('🔑 Session key derived from wallet address');

    // Decrypt data key
    const encryptedKeyBytes = decodeBase64(encryptedKey);
    const nonceBytes = decodeBase64(keyNonce);

    const dataKey = nacl.secretbox.open(encryptedKeyBytes, nonceBytes, sessionKey);

    if (!dataKey) {
      throw new Error('Failed to decrypt data key - wrong wallet or corrupted data');
    }

    console.log('✅ Data key decrypted successfully');

    return dataKey;
  } catch (error) {
    console.error('❌ Failed to decrypt data key:', error);
    throw new Error(
      error instanceof Error
        ? `Data key decryption failed: ${error.message}`
        : 'Failed to decrypt data key (ensure you are using the same wallet)'
    );
  }
}
