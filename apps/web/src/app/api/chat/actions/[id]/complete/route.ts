import { completeAction } from "@/lib/chat/harness/actions";
import { decisionResponse } from "../../../_lib/actions";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

/** POST /api/chat/actions/:id/complete {txHash?, error?} — money: the device reports the signed result (SSE). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return decisionResponse(request, params, "complete", ({ wallet, row, thread, body, emit }) => {
    const txHash = typeof body.txHash === "string" && TX_HASH_RE.test(body.txHash) ? body.txHash.toLowerCase() : null;
    const error = typeof body.error === "string" ? body.error : txHash ? null : "Keine gültige Transaktion gemeldet.";
    return completeAction({ wallet, row, thread, txHash, error, emit });
  });
}
