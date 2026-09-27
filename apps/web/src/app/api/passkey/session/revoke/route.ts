import { handleSessionRevoke } from "@/lib/passkey/session-handler";
import { passkeySessionDeps } from "@/lib/passkey/session-runtime";

/** PREVIEW-ONLY: revoke this device's API session token (or all of the identity's with { all: true }). */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleSessionRevoke(request, passkeySessionDeps());
}
