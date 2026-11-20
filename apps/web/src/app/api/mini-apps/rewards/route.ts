// /api/mini-apps/rewards
//   POST — the server-authorized reward grant. Called by the Expo/web host on
//          behalf of a mini app's `roebel.grantReward`. Enforces app.status,
//          budget, per-(app,wallet) rate-limit, idempotency; issues on-chain.
//          Body: { appId, amount, reason, idempotencyKey, wallet }
//          User: `Authorization: Bearer <mini-app user token>` (wins over
//          `wallet`); bare `wallet` only while MINIAPP_REQUIRE_USER_TOKEN≠1.
//   GET  — admin: recent reward ledger rows (optionally by app).
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { grantReward } from "@/lib/miniapp";
import { getApp } from "@/lib/miniapp/data";
import { HOST_HEADER, forRuntimeUser, resolveRuntimeUser, runtimeAuthDeps } from "@/lib/miniapp/runtimeAuth";
import { MiniAppError } from "@/lib/miniapp/types";
import { requireAdmin, jsonError, getParam } from "@/lib/miniapp/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    // The web Playground host sends `appId`; the Expo host sends `miniAppId` +
    // `slug`. Accept all three (getApp resolves both uuid and slug).
    const appId = String(body.appId ?? body.miniAppId ?? body.slug ?? "");
    const app = appId ? await getApp(appId) : null;
    if (!app) throw new MiniAppError("not_found", "App nicht gefunden.");
    const user = await resolveRuntimeUser(
      {
        authorization: req.headers.get("authorization"),
        app,
        claimedWallet: typeof body.wallet === "string" ? body.wallet : null,
        route: "rewards",
        host: req.headers.get(HOST_HEADER),
      },
      runtimeAuthDeps(),
    );
    const outcome = await grantReward(app.id, {
      amount: Number(body.amount),
      reason: String(body.reason ?? ""),
      idempotencyKey: String(body.idempotencyKey ?? ""),
      wallet: user.wallet,
    });
    // A version-2 app without the address grant never sees the tx hash (it names the wallet).
    return NextResponse.json(forRuntimeUser(outcome, user));
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
