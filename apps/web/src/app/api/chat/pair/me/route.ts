import { NextResponse } from "next/server";
import { resolveApprover } from "@/lib/chat/pairing-store";
import { handleError } from "../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/chat/pair/me → { signedIn } — lets the confirmation page show ONE clear next step. No wallet in the response. */
export async function GET(request: Request) {
  try {
    const approver = await resolveApprover(request);
    return NextResponse.json({ signedIn: !!approver });
  } catch (err) {
    return handleError(err, "pair/me");
  }
}
