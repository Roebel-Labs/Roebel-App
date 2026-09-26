import { handleEmailVerify } from "@/lib/passkey/email-handler";
import { passkeyEmailDeps } from "@/lib/passkey/email-runtime";

/**
 * PREVIEW-ONLY: optional warning email for passkey Safes (never a login, never a key).
 * Off unless PASSKEY_EMAIL_ENABLED=1. Contract + errors: lib/passkey/email-handler.ts.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleEmailVerify(request, passkeyEmailDeps());
}
