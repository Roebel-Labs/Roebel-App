/**
 * The passkey app session (`passkey_session_v1`, SecureStore): which passkey Safe this device is
 * signed in with and which address the app shows as "the account" (the identity).
 *
 * Nothing in here is secret: the key never leaves the authenticator. Restoring a session needs no
 * biometric prompt (the address needs no signature); the fingerprint is only asked for when the
 * adapter signs (a transaction, a message).
 *
 * Kept deliberately separate from every thirdweb key: signing out of a passkey session deletes
 * ONLY `passkey_session_v1`. The passkey itself stays on the device, `passkey_migration_v1`
 * stays, and a thirdweb login stored on the same device is never touched.
 */
import { getAddress, isAddress, isAddressEqual, type Address, type Hex } from 'viem';
import type { SafeOwnerType } from './migration';

export const PASSKEY_SESSION_KEY = 'passkey_session_v1';

export type PasskeySession = {
  credentialId: string;
  x: Hex;
  y: Hex;
  /** The passkey Safe (the userOp sender and the ERC-1271 signer). */
  safe: Address;
  /**
   * The address the app runs as: the legacy thirdweb account for migrated people (its data,
   * NFTs and Münzen stay attached), the Safe itself for passkey-only people and after a v3 moveTo.
   */
  identity: Address;
  ownerType: SafeOwnerType;
  owner: Address;
};

export type IdentityKind = 'legacy' | 'safe';

export function identityKind(s: Pick<PasskeySession, 'safe' | 'identity'>): IdentityKind {
  return isAddressEqual(s.safe, s.identity) ? 'safe' : 'legacy';
}

export type SessionStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  deleteItem: (key: string) => Promise<void>;
};

const HEX32 = /^0x[0-9a-fA-F]{64}$/;

/** Validates a parsed session (null when anything is missing or malformed). */
export function parsePasskeySession(raw: string | null): PasskeySession | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Partial<PasskeySession>;
    if (!s || typeof s.credentialId !== 'string' || !s.credentialId) return null;
    if (typeof s.x !== 'string' || !HEX32.test(s.x) || typeof s.y !== 'string' || !HEX32.test(s.y)) return null;
    if (!s.safe || !isAddress(s.safe) || !s.identity || !isAddress(s.identity) || !s.owner || !isAddress(s.owner)) return null;
    if (s.ownerType !== 'sharedSigner' && s.ownerType !== 'webauthnSigner') return null;
    return {
      credentialId: s.credentialId,
      x: s.x as Hex,
      y: s.y as Hex,
      safe: getAddress(s.safe),
      identity: getAddress(s.identity),
      ownerType: s.ownerType,
      owner: getAddress(s.owner),
    };
  } catch {
    return null;
  }
}

export async function loadPasskeySession(storage: Pick<SessionStorage, 'getItem'>): Promise<PasskeySession | null> {
  return parsePasskeySession(await storage.getItem(PASSKEY_SESSION_KEY));
}

export async function savePasskeySession(storage: Pick<SessionStorage, 'setItem'>, s: PasskeySession): Promise<void> {
  await storage.setItem(PASSKEY_SESSION_KEY, JSON.stringify(s));
}

/** Sign-out: removes ONLY the session key. */
export async function clearPasskeySession(storage: Pick<SessionStorage, 'deleteItem'>): Promise<void> {
  await storage.deleteItem(PASSKEY_SESSION_KEY);
}
