// The holder's credential actions for the Röbel App: my invitations, redeeming a link, accepting
// or declining, holdings, and the presentation relay. mine / redeem / respond / present_create are
// app only; holdings and present_resolve also accept a pairing session (lib/credentials/caller.ts).
// Payloads: redeem { token }, respond { invitationId, decision }, holdings { typeIds },
// present_create { presentation }, present_resolve { code }.
import { NextRequest } from "next/server";
import type { Hex } from "viem";
import { failResponse, jsonFail, jsonOk } from "@/lib/signed-request/verify";
import { authenticateCaller } from "@/lib/credentials/caller";
import type { Result } from "@/lib/credentials/actions";
import { holdings, ME_ACTIONS, mine, redeem, REDEEM_RATE_RULE, respond as respondToInvitation, type HolderDeps } from "@/lib/credentials/holder";
import { createPresentation, resolvePresentation, type Presentation } from "@/lib/credentials/presentations";
import { credentialDeps } from "@/lib/credentials/runtime";
import { sharedLimiters } from "@/lib/rate-limit/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const [redeemLimiter] = sharedLimiters([{ ...REDEEM_RATE_RULE }]);

function respond<T>(r: Result<T>) {
  return r.ok ? jsonOk(r.data) : jsonFail(r.status, r.code, r.message);
}

export async function POST(request: NextRequest) {
  const base = credentialDeps();
  if (!base) return jsonFail(503, "NOT_CONFIGURED", "Das Ausweis-Register ist auf diesem Knoten nicht eingerichtet.");
  const body = await request.json().catch(() => null);
  const c = await authenticateCaller(request, body, ME_ACTIONS);
  if (!c.ok) return failResponse(c);
  const p = c.payload;
  const d: HolderDeps = { ...base, takeRedeem: (wallet) => redeemLimiter.take(wallet) };
  try {
    switch (c.action) {
      case "mine":
        return respond(await mine(d, c));
      case "redeem":
        return respond(await redeem(d, c, { token: p.token as string }));
      case "respond":
        return respond(await respondToInvitation(d, c, p as { invitationId: string; decision: "accept" | "decline" }));
      case "holdings":
        return respond(await holdings(d, c, { typeIds: p.typeIds as Hex[] }));
      case "present_create":
        return respond(await createPresentation(d, c, p.presentation as Presentation));
      case "present_resolve":
        return respond(await resolvePresentation(d, c, { code: p.code as string }));
      default:
        return jsonFail(400, "BAD_REQUEST", "Unbekannte Aktion.");
    }
  } catch (err) {
    console.error("[credentials/me]", c.action, err instanceof Error ? err.message : err);
    return jsonFail(502, "UNAVAILABLE", "Gerade nicht erreichbar. Bitte versuche es gleich noch einmal.");
  }
}
