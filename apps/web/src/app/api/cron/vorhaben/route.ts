import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { gnosis } from "viem/chains";
import { createAdminClient } from "@/lib/supabase/admin";
import { gnosisReader, listAttesters } from "@/lib/vorhaben/chain";
import { dispatchLines, reconcile, type DispatchDeps } from "@/lib/vorhaben/dispatch";
import { sendViaFunder } from "@/lib/vorhaben/rails/funder";
import { safeRailFromEnv } from "@/lib/vorhaben/rails/safe";
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
  let settings: Awaited<ReturnType<typeof loadSettings>>;
  let proposals: Awaited<ReturnType<typeof listActiveProposals>>;
  try {
    settings = await loadSettings(db);
    proposals = await listActiveProposals(db);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cron/vorhaben] setup failed", msg);
    return NextResponse.json({ synced: 0, dispatched: false, errors: [msg] }, { status: 500 });
  }
  const reader = gnosisReader();

  let synced = 0;
  for (const p of proposals) {
    try {
      if (await syncProposal({ db, reader, settings, nowMs: Date.now, listAttesters }, p)) synced++;
    } catch (e) {
      errors.push(`sync ${p.proposal_number}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (settings.dispatchEnabled) {
    const pub = createPublicClient({ chain: gnosis, transport: http(process.env.GNOSIS_RPC_URL ?? "https://rpc.gnosischain.com", { batch: false }) });
    const receiptStatus: DispatchDeps["receiptStatus"] = async (hash) => {
      const r = await pub.getTransactionReceipt({ hash: hash as `0x${string}` }).catch(() => null);
      return !r ? "pending" : r.status === "success" ? "success" : "reverted";
    };
    const safeRail = safeRailFromEnv(db, receiptStatus);
    const deps: DispatchDeps = {
      db, sendFunder: sendViaFunder, nowMs: Date.now, receiptStatus,
      proposeSafe: safeRail?.proposeSafe ?? (async () => {}), pollSafe: safeRail?.pollSafe ?? (async () => {}),
    };
    try {
      await dispatchLines(deps, await openLines(db));
    } catch (e) {
      errors.push(`dispatch: ${e instanceof Error ? e.message : String(e)}`);
    }
    try {
      await reconcile(deps);
    } catch (e) {
      errors.push(`reconcile: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (errors.length) console.error("[cron/vorhaben]", errors);
  return NextResponse.json({ synced, dispatched: settings.dispatchEnabled, errors });
}
