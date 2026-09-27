/**
 * Wires the passkey key-backup routes from env (PREVIEW-ONLY). Server-only.
 *
 *   PASSKEY_KEY_BACKUP_ENABLED=1   routes answer; anything else = 503 { error: 'disabled' }
 *   NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *                                  required (table passkey_key_backups, migration
 *                                  20260927_passkey_key_backup.sql). There is deliberately NO
 *                                  in-memory fallback: a backup that vanishes on a cold start
 *                                  would tell people their keys are safe when they are not.
 *   GNOSIS_RPC_URL                 optional (signature checks on Gnosis)
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAccountSignature } from "@/lib/auth/verify-account-signature";
import type { KeyBackupDeps } from "./key-backup-handler";
import type { KeyBackupStore } from "./key-backup-store";
import { SupabaseKeyBackupStore } from "./key-backup-store-supabase";

export const passkeyKeyBackupEnabled = () => process.env.PASSKEY_KEY_BACKUP_ENABLED === "1";

let store: KeyBackupStore | null = null;

function keyBackupStore(): KeyBackupStore | null {
  if (store) return store;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  store = new SupabaseKeyBackupStore(createAdminClient());
  return store;
}

export function passkeyKeyBackupDeps(): KeyBackupDeps {
  if (!passkeyKeyBackupEnabled()) return { enabled: false } as KeyBackupDeps;
  return {
    enabled: true,
    store: keyBackupStore(),
    verify: ({ address, message, signature }) => verifyAccountSignature({ address, message, signature }),
    nowSec: () => Math.floor(Date.now() / 1000),
  };
}
