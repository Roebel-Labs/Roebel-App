/**
 * Storage for the passkey key backup: one wrapped blob per (identity, slot) (KEY_BACKUP_BLOB_KEYS). Server-only.
 * The Supabase implementation is key-backup-store-supabase.ts; this in-memory one is for tests.
 */
import type { KeyBackupBlobs } from "./key-backup-proof";

export class KeyBackupStoreError extends Error {
  constructor(op: string) {
    super(`key backup store failed: ${op}`);
    this.name = "KeyBackupStoreError";
  }
}

export interface KeyBackupStore {
  /** Every slot stored for `identity` (lowercased address). */
  get(identity: string): Promise<KeyBackupBlobs>;
  /** Insert or overwrite the given slots. */
  put(identity: string, blobs: KeyBackupBlobs): Promise<void>;
}

export class InMemoryKeyBackupStore implements KeyBackupStore {
  readonly rows = new Map<string, KeyBackupBlobs>();

  async get(identity: string) {
    return { ...(this.rows.get(identity.toLowerCase()) ?? {}) };
  }

  async put(identity: string, blobs: KeyBackupBlobs) {
    const id = identity.toLowerCase();
    this.rows.set(id, { ...(this.rows.get(id) ?? {}), ...blobs });
  }
}
