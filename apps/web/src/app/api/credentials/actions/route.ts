// The phone side of a prepared credential action: fetch the steps, report the transaction,
// cancel. `action_submitted` is app only (refused for a pairing session in authenticateCaller).
import { NextRequest } from "next/server";
import type { Hex } from "viem";
import { failResponse, jsonFail, jsonOk } from "@/lib/signed-request/verify";
import type { CredentialAction } from "@/lib/signed-request/message";
import { authenticateCaller } from "@/lib/credentials/caller";
import { cancelAction, getActionForPhone, recordSubmitted, type Result } from "@/lib/credentials/actions";
import { credentialDeps } from "@/lib/credentials/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS: readonly CredentialAction[] = ["action_get", "action_submitted", "action_cancel"];

function respond<T>(r: Result<T>) {
  return r.ok ? jsonOk(r.data) : jsonFail(r.status, r.code, r.message);
}

export async function POST(request: NextRequest) {
  const d = credentialDeps();
  if (!d) return jsonFail(503, "NOT_CONFIGURED", "Das Ausweis-Register ist auf diesem Knoten nicht eingerichtet.");
  const body = await request.json().catch(() => null);
  const c = await authenticateCaller(request, body, ACTIONS);
  if (!c.ok) return failResponse(c);
  const actionId = String(c.payload.actionId ?? "");
  try {
    switch (c.action) {
      case "action_get":
        return respond(await getActionForPhone(d, c, actionId));
      case "action_submitted":
        return respond(await recordSubmitted(d, c, { actionId, txHash: c.payload.txHash as Hex }));
      case "action_cancel":
        return respond(await cancelAction(d, c, actionId));
      default:
        return jsonFail(400, "BAD_REQUEST", "Unbekannte Aktion.");
    }
  } catch (err) {
    console.error("[credentials/actions]", c.action, err instanceof Error ? err.message : err);
    return jsonFail(502, "UNAVAILABLE", "Gerade nicht erreichbar. Bitte versuche es gleich noch einmal.");
  }
}
