import { rejectAction } from "@/lib/chat/harness/actions";
import { decisionResponse } from "../../../_lib/actions";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** POST /api/chat/actions/:id/reject {reason?} — marks rejected, bot acknowledges briefly (SSE). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return decisionResponse(request, params, "reject", ({ wallet, row, thread, body, emit }) =>
    rejectAction({ wallet, row, thread, reason: typeof body.reason === "string" ? body.reason : null, emit }));
}
