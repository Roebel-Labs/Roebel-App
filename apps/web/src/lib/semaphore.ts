/**
 * Semaphore Identity Management Library
 * Handles Semaphore identity generation, storage, and proof generation
 */

import { Identity } from "@semaphore-protocol/identity";
import { Group } from "@semaphore-protocol/group";
import { generateProof, type SemaphoreProof } from "@semaphore-protocol/proof";

const IDENTITY_STORAGE_KEY = "hometown-dao-identity";
const IDENTITY_BACKUP_KEY = "hometown-dao-identity-backup";

/**
 * Generate a new Semaphore identity
 * The identity is generated locally and never sent to a server
 */
export function generateIdentity(): Identity {
  return new Identity();
}

/**
 * Get identity commitment (public, shareable)
 */
export function getCommitment(identity: Identity): string {
  return identity.commitment.toString();
}

/**
 * Save identity to encrypted localStorage
 * WARNING: This is for demo purposes. In production, use more secure storage.
 */
export function saveIdentity(identity: Identity, password?: string): void {
  if (typeof window === 'undefined') return;

  try {
    const identityString = identity.toString();

    if (password) {
      // In production, implement proper encryption here
      // For now, we just store it (NOT SECURE FOR PRODUCTION)
      const encrypted = btoa(identityString + ":" + password);
      localStorage.setItem(IDENTITY_STORAGE_KEY, encrypted);
    } else {
      localStorage.setItem(IDENTITY_STORAGE_KEY, identityString);
    }

    // Create backup
    const timestamp = new Date().toISOString();
    localStorage.setItem(
      IDENTITY_BACKUP_KEY,
      JSON.stringify({ identity: identityString, timestamp })
    );

    console.log("✅ Identity saved successfully");
  } catch (error) {
    console.error("❌ Failed to save identity:", error);
    throw new Error("Failed to save identity");
  }
}

/**
 * Load identity from localStorage
 */
export function loadIdentity(password?: string): Identity | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = localStorage.getItem(IDENTITY_STORAGE_KEY);

    if (!stored) {
      return null;
    }

    let identityString = stored;

    if (password) {
      // In production, implement proper decryption here
      const decrypted = atob(stored);
      const [identity, storedPassword] = decrypted.split(":");
      if (storedPassword !== password) {
        throw new Error("Invalid password");
      }
      identityString = identity;
    }

    return new Identity(identityString);
  } catch (error) {
    console.error("❌ Failed to load identity:", error);
    return null;
  }
}

/**
 * Check if user has an identity
 */
export function hasIdentity(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(IDENTITY_STORAGE_KEY) !== null;
}

/**
 * Export identity for backup (encrypted)
 */
export function exportIdentity(identity: Identity, password: string): string {
  const identityString = identity.toString();
  const data = JSON.stringify({
    identity: identityString,
    commitment: identity.commitment.toString(),
    timestamp: new Date().toISOString(),
    version: "1.0",
  });

  // In production, use proper encryption
  const encrypted = btoa(data + ":" + password);
  return encrypted;
}

/**
 * Import identity from backup
 */
export function importIdentity(
  encryptedData: string,
  password: string
): Identity {
  try {
    const decrypted = atob(encryptedData);
    const [data, storedPassword] = decrypted.split(":");

    if (storedPassword !== password) {
      throw new Error("Invalid password");
    }

    const parsed = JSON.parse(data);
    return new Identity(parsed.identity);
  } catch (error) {
    console.error("❌ Failed to import identity:", error);
    throw new Error("Failed to import identity. Check your password.");
  }
}

/**
 * Delete identity (use with caution!)
 */
export function deleteIdentity(): void {
  if (typeof window === 'undefined') return;

  localStorage.removeItem(IDENTITY_STORAGE_KEY);
  localStorage.removeItem(IDENTITY_BACKUP_KEY);
  console.log("🗑️ Identity deleted");
}

/**
 * Create a Semaphore group from member commitments
 */
export function createGroup(
  groupId: string,
  members: string[] = [],
  treeDepth: number = 20
): Group {
  const group = new Group();
  // Add members to the group
  members.forEach(member => group.addMember(member));
  return group;
}

/**
 * Generate a Semaphore proof for a message
 * @param identity The user's Semaphore identity
 * @param group The Semaphore group
 * @param message The message to sign (will be hashed)
 * @param scope The scope (typically groupId or proposalId)
 */
export async function generateSemaphoreProof(
  identity: Identity,
  group: Group,
  message: bigint | string,
  scope: bigint | string
): Promise<SemaphoreProof> {
  try {
    const proof = await generateProof(identity, group, message, scope);
    return proof;
  } catch (error) {
    console.error("❌ Failed to generate proof:", error);
    throw new Error("Failed to generate proof");
  }
}

/**
 * Hash a message for Semaphore (constrain to SNARK field)
 */
export function hashMessage(message: string): bigint {
  const hash = BigInt(
    "0x" +
      Array.from(new TextEncoder().encode(message))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
  );

  // Constrain to SNARK scalar field
  const SNARK_FIELD_SIZE = BigInt(
    "21888242871839275222246405745257275088548364400416034343698204186575808495617"
  );
  return hash % SNARK_FIELD_SIZE;
}

/**
 * Format identity information for display
 * Note: Semaphore v4 uses EdDSA key pairs, not nullifier/trapdoor
 */
export function formatIdentityInfo(identity: Identity) {
  return {
    commitment: identity.commitment.toString(),
    // Semaphore v4 uses EdDSA - privateKey is the secret
    privateKey: identity.toString(), // This is the secret you need to backup
    // WARNING: Never expose private key in production!
  };
}

/**
 * Generate a deterministic identity from a secret phrase
 * Useful for account recovery
 */
export function generateIdentityFromSecret(secret: string): Identity {
  return new Identity(secret);
}

/**
 * Validate identity commitment format
 */
export function isValidCommitment(commitment: string): boolean {
  try {
    const num = BigInt(commitment);
    const SNARK_FIELD_SIZE = BigInt(
      "21888242871839275222246405745257275088548364400416034343698204186575808495617"
    );
    return num > 0n && num < SNARK_FIELD_SIZE;
  } catch {
    return false;
  }
}

/**
 * Get identity age (for security checks)
 */
export function getIdentityAge(): number | null {
  if (typeof window === 'undefined') return null;

  const backup = localStorage.getItem(IDENTITY_BACKUP_KEY);
  if (!backup) return null;

  try {
    const { timestamp } = JSON.parse(backup);
    const created = new Date(timestamp);
    const now = new Date();
    return now.getTime() - created.getTime();
  } catch {
    return null;
  }
}
