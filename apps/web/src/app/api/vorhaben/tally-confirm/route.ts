import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { jsonFail, jsonOk } from "@/lib/signed-request/verify";
import { verifyWalletSignature, VerifierUnavailableError } from "@/lib/signed-request/signature";
import { gnosisReader } from "@/lib/vorhaben/chain";
import { buildDispatch } from "@/lib/vorhaben/runtime";
import { loadSettings } from "@/lib/vorhaben/settings";
import { getTallyView, submitTallyConfirmation, type TallyDeps } from "@/lib/vorhaben/tally-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WALLET_RE = /^0x[0-9a-fA-F]{40}$/;

async function deps(): Promise<TallyDeps> {
  const db = createAdminClient();
  const settings = await loadSettings(db);
  return {
    db, settings, reader: gnosisReader(), nowMs: Date.now,
    verify: (w, m, s) => verifyWalletSignature(w, m, s),
    dispatch: buildDispatch(db),
  };
}

export async function GET(req: NextRequest) {
  const proposalId = req.nextUrl.searchParams.get("proposalId") ?? "";
  const wallet = req.nextUrl.searchParams.get("wallet") ?? "";
  if (!UUID_RE.test(proposalId) || !WALLET_RE.test(wallet)) return jsonFail(400, "BAD_REQUEST", "proposalId/wallet malformed");
  try {
    const view = await getTallyView(await deps(), proposalId, wallet);
    return "error" in view ? jsonFail(view.status, "UNAVAILABLE", view.error) : jsonOk(view);
  } catch (e) {
    console.error("[vorhaben/tally-confirm] GET", e);
    return jsonFail(500, "INTERNAL", "Auszählung konnte nicht geladen werden.");
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { proposalId?: string; wallet?: string; signature?: string } | null;
  if (!body || !UUID_RE.test(body.proposalId ?? "") || !WALLET_RE.test(body.wallet ?? "") || !/^0x[0-9a-fA-F]+$/.test(body.signature ?? "")) {
    return jsonFail(400, "BAD_REQUEST", "proposalId/wallet/signature malformed");
  }
  try {
    const r = await submitTallyConfirmation(await deps(), body.proposalId!, body.wallet!, body.signature!);
    return r.ok ? jsonOk({ lineIds: r.lineIds }) : jsonFail(r.status, r.code, r.message);
  } catch (e) {
    if (e instanceof VerifierUnavailableError) return jsonFail(503, "VERIFY_UNAVAILABLE", "Signaturprüfung gerade nicht erreichbar. Bitte später erneut versuchen.");
    console.error("[vorhaben/tally-confirm]", e);
    return jsonFail(500, "INTERNAL", "Bestätigung fehlgeschlagen.");
  }
}
