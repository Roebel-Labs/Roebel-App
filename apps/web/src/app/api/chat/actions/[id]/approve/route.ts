import { approveAction } from "@/lib/chat/harness/actions";
import { decisionResponse } from "../../../_lib/actions";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** POST /api/chat/actions/:id/approve {alwaysAllow?} — executes, updates the card, bot continues (SSE). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return decisionResponse(request, params, "approve", ({ wallet, row, thread, body, emit }) =>
    approveAction({ wallet, row, thread, alwaysAllow: body.alwaysAllow === true, emit }));
}
