// /api/mini-apps/rewards
//   POST — the server-authorized reward grant. Called by the Expo/web host on
//          behalf of a mini app's `roebel.grantReward`. Enforces app.status,
//          budget, per-(app,wallet) rate-limit, idempotency; issues on-chain.
//          Body: { appId, amount, reason, idempotencyKey, wallet }
//   GET  — admin: recent reward ledger rows (optionally by app).
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { grantReward } from "@/lib/miniapp";
import { requireAdmin, jsonError, getParam } from "@/lib/miniapp/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const appId = String(body.appId ?? "");
    const outcome = await grantReward(appId, {
      amount: Number(body.amount),
      reason: String(body.reason ?? ""),
      idempotencyKey: String(body.idempotencyKey ?? ""),
      wallet: String(body.wallet ?? ""),
    });
    return NextResponse.json(outcome);
  } catch (e) {
    return jsonError(e);
  }
}

export async function GET(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const supabase = createAdminClient();
    const appId = getParam(req, "appId");
    let q = supabase
      .from("mini_app_rewards")
      .select("id, mini_app_id, wallet, amount, reason, status, tx_ref, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (appId && appId !== "all") q = q.eq("mini_app_id", appId);
    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ rewards: data ?? [] });
  } catch (e) {
    return jsonError(e);
  }
}
