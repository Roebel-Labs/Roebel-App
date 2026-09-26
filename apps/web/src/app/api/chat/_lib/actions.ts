// Shared plumbing for /api/chat/actions/:id/{approve,reject,complete}:
// auth + precheck as JSON errors, then the decision streams as SSE.
import { ActionError, precheckAction } from "@/lib/chat/harness/actions";
import type { Decision } from "@/lib/chat/harness/actions";
import type { ActionRow } from "@/lib/chat/harness/audit";
import type { Emit } from "@/lib/chat/runtime";
import { createSSEStream, SSE_HEADERS } from "@/lib/chat/sse";
import type { ChatThread } from "@/lib/chat/types";
import { badRequest, handleError, jsonError, readJson, requireWallet, unauthorized } from "./http";

export async function decisionResponse(
  request: Request, params: Promise<{ id: string }>, decision: Decision,
  run: (input: { wallet: string; row: ActionRow; thread: ChatThread; body: Record<string, unknown>; emit: Emit }) => Promise<void>,
): Promise<Response> {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  const { id } = await params;
  const body = (await readJson(request)) ?? {};
  let checked: { row: ActionRow; thread: ChatThread };
  try {
    checked = await precheckAction(wallet, id, decision);
  } catch (err) {
    if (err instanceof ActionError) return jsonError(err.status, err.code, err.message);
    return handleError(err, `actions/:id/${decision}`);
  }
  if (!body || typeof body !== "object") return badRequest("Ungültige Anfrage.");
  const stream = createSSEStream((emit) => run({ wallet, ...checked, body, emit }));
  return new Response(stream, { headers: SSE_HEADERS });
}
