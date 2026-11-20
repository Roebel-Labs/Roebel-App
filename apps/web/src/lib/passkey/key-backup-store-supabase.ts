/**
 * Supabase (service role) KeyBackupStore. Server-only.
 *
 * Table public.passkey_key_backups (supabase/migrations/20260927_passkey_key_backup.sql, NOT
 * applied; slot list widened by 20261117c_passkey_key_backup_words_slots.sql): RLS on, no
 * policies, every privilege revoked from anon/authenticated, so only the service role reaches it. This file touches no other table.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isKeyBackupBlobKey, type KeyBackupBlobKey, type KeyBackupBlobs } from "./key-backup-proof";
import { KeyBackupStoreError, type KeyBackupStore } from "./key-backup-store";

export const PASSKEY_KEY_BACKUP_TABLE = "passkey_key_backups";

export class SupabaseKeyBackupStore implements KeyBackupStore {
  constructor(private readonly db: SupabaseClient) {}

  async get(identity: string): Promise<KeyBackupBlobs> {
    const r = await this.db
      .from(PASSKEY_KEY_BACKUP_TABLE)
      .select("slot, blob")
      .eq("identity_address", identity.toLowerCase());
    if (r.error) throw new KeyBackupStoreError("get");
    const out: KeyBackupBlobs = {};
    for (const row of (r.data ?? []) as Array<{ slot: string; blob: string }>) {
      if (isKeyBackupBlobKey(row.slot)) out[row.slot] = row.blob;
    }
    return out;
  }

  async put(identity: string, blobs: KeyBackupBlobs): Promise<void> {
    const now = new Date().toISOString();
    const rows = (Object.keys(blobs) as KeyBackupBlobKey[]).map((slot) => ({
      identity_address: identity.toLowerCase(),
      slot,
      blob: blobs[slot],
      updated_at: now,
    }));
    if (rows.length === 0) return;
    const r = await this.db.from(PASSKEY_KEY_BACKUP_TABLE).upsert(rows, { onConflict: "identity_address,slot" });
    if (r.error) throw new KeyBackupStoreError("put");
  }
}
