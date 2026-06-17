/**
 * Citizen verification commitment helpers.
 *
 * commitment = Poseidon(firstName, lastName, birthdate, address, salt)
 *   - salt is derived deterministically from a fixed EIP-712 wallet signature
 *     (reproducible across devices, confidential — requires the private key).
 *   - the preimage NEVER leaves the device (cached in expo-secure-store);
 *     only the non-reversible commitment hex is stored server-side / on-chain.
 *
 * This replaces the previous reversible wallet-address-derived "encryption"
 * (lib/encryption.ts deriveSessionKey), which was decryptable by anyone who
 * read the public Supabase row.
 */
import { keccak256 } from 'thirdweb/utils';
import { hash5, SNARK_FIELD_SIZE } from 'maci-crypto';
import * as SecureStore from 'expo-secure-store';
import type { Account } from 'thirdweb/wallets';
import type { CitizenIdentity, CitizenPreimage, CommitmentEvidence } from './verification-types';

/** Fixed EIP-712 domain/message for deterministic salt derivation (NO timestamp). */
const SALT_DOMAIN = {
  name: 'Roebel Citizen Commitment',
  version: '1',
  chainId: 8453, // Base today; ported to Gnosis (100) in Circles Phase 0.
} as const;

const SALT_TYPES = {
  CommitmentSalt: [{ name: 'purpose', type: 'string' }],
} as const;

const SALT_MESSAGE = { purpose: 'Derive Roebel citizen commitment salt' } as const;

/** Convert "DD.MM.YYYY" to canonical ISO "YYYY-MM-DD", or null if invalid. */
export function germanDateToIso(input: string): string | null {
  const m = input.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year < 1900 || year > 2100) return null;
  return `${yyyy}-${mm}-${dd}`;
}

/** Hash a UTF-8 string into a BabyJubjub field element (frozen encoding). */
export function fieldFromString(s: string): bigint {
  const bytes = new TextEncoder().encode(s);
  return BigInt(keccak256(bytes)) % SNARK_FIELD_SIZE;
}

/** Reduce a wallet signature (0x-hex) to a decimal field-element salt. */
export function saltFromSignature(signature: string): string {
  const reduced = BigInt(keccak256(signature as `0x${string}`)) % SNARK_FIELD_SIZE;
  return reduced.toString();
}

/** Compute the Poseidon commitment for a full preimage. Returns 0x-hex. */
export function computeCommitment(preimage: CitizenPreimage): string {
  const elements: bigint[] = [
    fieldFromString(preimage.firstName.trim().toLowerCase()),
    fieldFromString(preimage.lastName.trim().toLowerCase()),
    fieldFromString(preimage.birthdate.trim()),
    fieldFromString(preimage.address.trim().toLowerCase()),
    BigInt(preimage.salt),
  ];
  return '0x' + hash5(elements).toString(16);
}

/**
 * Derive the wallet-bound salt by signing a FIXED EIP-712 message. Deterministic
 * per wallet (no timestamp), so it reproduces on any device with the same wallet.
 * Reuses the same deterministic-signing approach as the MACI voter keys.
 */
export async function deriveCommitmentSalt(account: Account): Promise<string> {
  const signature = await account.signTypedData({
    domain: SALT_DOMAIN,
    types: SALT_TYPES,
    primaryType: 'CommitmentSalt',
    message: SALT_MESSAGE,
  });
  return saltFromSignature(signature);
}

const preimageKey = (address: string) =>
  `citizen-preimage:${address.toLowerCase()}`;

/** Persist the preimage on-device so the owner can re-display it / prefill later. */
export async function storeCitizenPreimage(
  address: string,
  preimage: CitizenPreimage
): Promise<void> {
  await SecureStore.setItemAsync(preimageKey(address), JSON.stringify(preimage));
}

/** Load the on-device preimage, or null if absent (e.g. fresh device). */
export async function loadCitizenPreimage(
  address: string
): Promise<CitizenPreimage | null> {
  const raw = await SecureStore.getItemAsync(preimageKey(address));
  return raw ? (JSON.parse(raw) as CitizenPreimage) : null;
}

/**
 * Build the full commitment bundle for a request: derives the salt, computes the
 * commitment, persists the preimage on-device, and returns the on-chain
 * evidenceURI + the non-PII CommitmentEvidence for Supabase.
 */
export async function buildCitizenCommitment(
  identity: CitizenIdentity,
  reason: string,
  type: 'citizen' | 'attester',
  account: Account
): Promise<{ evidenceURI: string; evidence: CommitmentEvidence; preimage: CitizenPreimage }> {
  const salt = await deriveCommitmentSalt(account);
  const preimage: CitizenPreimage = { ...identity, salt };
  const commitment = computeCommitment(preimage);

  await storeCitizenPreimage(account.address, preimage);

  const evidence: CommitmentEvidence = {
    commitment,
    type,
    requester: account.address,
    reason,
    timestamp: new Date().toISOString(),
    version: 'commit-v1',
  };

  return { evidenceURI: `commit:${commitment}`, evidence, preimage };
}
