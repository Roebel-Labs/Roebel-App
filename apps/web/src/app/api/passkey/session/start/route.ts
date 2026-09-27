import { handleSessionStart } from "@/lib/passkey/session-handler";
import { passkeySessionDeps } from "@/lib/passkey/session-runtime";

/**
 * PREVIEW-ONLY: one signature by the identity → a revocable, device-bound API session token
 * (≤ 30 days). Off unless PASSKEY_SESSION_TOKENS_ENABLED=1. Contract: lib/passkey/session-handler.ts.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleSessionStart(request, passkeySessionDeps());
}
