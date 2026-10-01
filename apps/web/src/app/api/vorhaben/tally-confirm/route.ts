import { NextRequest } from "next/server";
import { createPublicClient, http } from "viem";
import { gnosis } from "viem/chains";
import { createAdminClient } from "@/lib/supabase/admin";
import { jsonFail, jsonOk } from "@/lib/signed-request/verify";
import { verifyWalletSignature, VerifierUnavailableError } from "@/lib/signed-request/signature";
import { gnosisReader } from "@/lib/vorhaben/chain";
import { dispatchLines } from "@/lib/vorhaben/dispatch";
import { sendViaFunder } from "@/lib/vorhaben/rails/funder";
import { loadSettings } from "@/lib/vorhaben/settings";
import { getTallyView, submitTallyConfirmation, type TallyDeps } from "@/lib/vorhaben/tally-service";
import type { LineRow } from "@/lib/vorhaben/repo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WALLET_RE = /^0x[0-9a-fA-F]{40}$/;

async function deps(): Promise<TallyDeps> {
  const db = createAdminClient();
  const settings = await loadSettings(db);
  const pub = createPublicClient({ chain: gnosis, transport: http(process.env.GNOSIS_RPC_URL ?? "https://rpc.gnosischain.com", { batch: false }) });
  return {
    db, settings, reader: gnosisReader(), nowMs: Date.now,
    verify: (w, m, s) => verifyWalletSignature(w, m, s),
    dispatch: async (ids) => {
      const { data } = await db.from("proposal_payout_lines").select("*").in("id", ids);
      await dispatchLines({
        db, sendFunder: sendViaFunder, nowMs: Date.now, proposeSafe: async () => {}, pollSafe: async () => {},
        receiptStatus: async (h) => { const r = await pub.getTransactionReceipt({ hash: h as `0x${string}` }).catch(() => null); return !r ? "pending" : r.status === "success" ? "success" : "reverted"; },
      }, (data ?? []) as LineRow[]);
    },
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
