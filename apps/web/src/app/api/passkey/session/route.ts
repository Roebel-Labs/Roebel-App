import { handleSessionInfo } from "@/lib/passkey/session-handler";
import { passkeySessionDeps } from "@/lib/passkey/session-runtime";

/**
 * PREVIEW-ONLY: does this server issue/accept passkey API session tokens? Lets the app skip
 * signing a session message the server would not accept. Contract: lib/passkey/session-handler.ts.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handleSessionInfo(passkeySessionDeps());
}
