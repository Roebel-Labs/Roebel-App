import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { gnosis } from "viem/chains";
import { createAdminClient } from "@/lib/supabase/admin";
import { gnosisReader, listAttesters } from "@/lib/vorhaben/chain";
import { dispatchLines, reconcile, type DispatchDeps } from "@/lib/vorhaben/dispatch";
import { sendViaFunder } from "@/lib/vorhaben/rails/funder";
import { listActiveProposals, openLines } from "@/lib/vorhaben/repo";
import { loadSettings } from "@/lib/vorhaben/settings";
import { syncProposal } from "@/lib/vorhaben/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = createAdminClient();
  const errors: string[] = [];
  const settings = await loadSettings(db);
  const reader = gnosisReader();

  let synced = 0;
  for (const p of await listActiveProposals(db)) {
    try {
      if (await syncProposal({ db, reader, settings, nowMs: Date.now, listAttesters }, p)) synced++;
    } catch (e) {
      errors.push(`sync ${p.proposal_number}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (settings.dispatchEnabled) {
    const pub = createPublicClient({ chain: gnosis, transport: http(process.env.GNOSIS_RPC_URL ?? "https://rpc.gnosischain.com", { batch: false }) });
    const deps: DispatchDeps = {
      db, sendFunder: sendViaFunder, nowMs: Date.now,
      proposeSafe: async () => {}, pollSafe: async () => {}, // wired in Task 13
      receiptStatus: async (hash) => {
        const r = await pub.getTransactionReceipt({ hash: hash as `0x${string}` }).catch(() => null);
        return !r ? "pending" : r.status === "success" ? "success" : "reverted";
      },
    };
    try {
      await dispatchLines(deps, await openLines(db));
      await reconcile(deps);
    } catch (e) {
      errors.push(`dispatch: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (errors.length) console.error("[cron/vorhaben]", errors);
  return NextResponse.json({ synced, dispatched: settings.dispatchEnabled, errors });
}
