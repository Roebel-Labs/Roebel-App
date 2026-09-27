import { handleKeyBackupPut } from "@/lib/passkey/key-backup-handler";
import { passkeyKeyBackupDeps } from "@/lib/passkey/key-backup-runtime";

/**
 * PREVIEW-ONLY: PRF-wrapped key backup for passkey sessions (ciphertext only; useless without the
 * passkey). Off unless PASSKEY_KEY_BACKUP_ENABLED=1. Contract + errors: lib/passkey/key-backup-handler.ts.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleKeyBackupPut(request, passkeyKeyBackupDeps());
}
