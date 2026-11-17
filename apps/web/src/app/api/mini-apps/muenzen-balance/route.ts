// GET /api/mini-apps/muenzen-balance?app=<id|slug>&wallet=0x... — live
// Röbel-Münzen balance. Used by the bridge hosts for `roebel.getMuenzenBalance`.
// Read-only, no secrets; the on-chain read is server-side (Gnosis RPC).
//
// The app may come as `app`, `miniAppId` or `slug` (the Expo host sends the
// latter two). The user comes from `Authorization: Bearer <mini-app user
// token>` (wins over `wallet`); the bare `wallet` is accepted only while
// MINIAPP_REQUIRE_USER_TOKEN≠1. Without a resolvable app a token cannot be
// checked, so only the legacy wallet path (switch off) works then.
import { NextResponse } from "next/server";
import { getMuenzenBalance } from "@/lib/miniapp";
import { getApp } from "@/lib/miniapp/data";
import { jsonError, getParam } from "@/lib/miniapp/http";
import {
  MISSING_TOKEN_MESSAGE,
  bearerToken,
  resolveRuntimeUser,
  runtimeAuthDeps,
} from "@/lib/miniapp/runtimeAuth";
import { MiniAppError } from "@/lib/miniapp/types";

export const dynamic = "force-dynamic";

const WALLET_RE = /^0x[0-9a-fA-F]{40}$/;
const EMPTY = { balance: "0", decimals: 18, symbol: "RÖ" } as const;

export async function GET(req: Request) {
  try {
    const authorization = req.headers.get("authorization");
    const hasToken = bearerToken(authorization) !== null;
    const claimedWallet = getParam(req, "wallet") || "";
    const deps = runtimeAuthDeps();

    const appRef = getParam(req, "app") || getParam(req, "miniAppId") || getParam(req, "slug");
    const app = appRef ? await getApp(appRef) : null;

    if (!app) {
      if (hasToken) throw new MiniAppError("unauthorized", "App nicht gefunden — Nutzer-Token nicht prüfbar.");
      if (deps.requireToken) throw new MiniAppError("unauthorized", MISSING_TOKEN_MESSAGE);
      // Legacy behaviour (switch off, no app): trust the wallet param.
      if (!WALLET_RE.test(claimedWallet)) return NextResponse.json(EMPTY);
      return NextResponse.json(await getMuenzenBalance(claimedWallet));
    }

    // Logged-out legacy caller (the Expo host sends wallet=""): zero, as before.
    if (!hasToken && !deps.requireToken && !WALLET_RE.test(claimedWallet)) {
      return NextResponse.json(EMPTY);
    }

    const user = await resolveRuntimeUser(
      { authorization, app, claimedWallet, route: "muenzen-balance" },
      deps,
    );
    return NextResponse.json(await getMuenzenBalance(user.wallet));
  } catch (e) {
    return jsonError(e);
  }
}
