/**
 * Supabase (service role) KeyBackupStore. Server-only.
 *
 * Table public.passkey_key_backups (supabase/migrations/20260927_passkey_key_backup.sql, NOT
 * applied): RLS on, no policies, every privilege revoked from anon/authenticated, so only the
 * service role reaches it. This file touches no other table.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isKeyBackupSlot, type KeyBackupSlot } from "./key-backup-proof";
import { KeyBackupStoreError, type KeyBackupStore } from "./key-backup-store";

export const PASSKEY_KEY_BACKUP_TABLE = "passkey_key_backups";

export class SupabaseKeyBackupStore implements KeyBackupStore {
  constructor(private readonly db: SupabaseClient) {}

  async get(identity: string): Promise<Partial<Record<KeyBackupSlot, string>>> {
    const r = await this.db
      .from(PASSKEY_KEY_BACKUP_TABLE)
      .select("slot, blob")
      .eq("identity_address", identity.toLowerCase());
    if (r.error) throw new KeyBackupStoreError("get");
    const out: Partial<Record<KeyBackupSlot, string>> = {};
    for (const row of (r.data ?? []) as Array<{ slot: string; blob: string }>) {
      if (isKeyBackupSlot(row.slot)) out[row.slot] = row.blob;
    }
    return out;
  }

  async put(identity: string, blobs: Partial<Record<KeyBackupSlot, string>>): Promise<void> {
    const now = new Date().toISOString();
    const rows = (Object.keys(blobs) as KeyBackupSlot[]).map((slot) => ({
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
