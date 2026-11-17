import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { verifySignedRequest } from "@/lib/signed-request/verify";
import { MINIAPP_SCOPE } from "@/lib/signed-request/message";
import { getApp } from "@/lib/miniapp/data";
import { tokenKeysFromEnv } from "@/lib/miniapp/userToken";
import { handleUserTokenRequest } from "@/lib/miniapp/userTokenHandler";
import { sharedLimiters } from "@/lib/rate-limit/server";
import { MINUTE_MS, takeAll } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiters = sharedLimiters([{ name: "miniapp-token-wallet", limit: 30, windowMs: MINUTE_MS }]);

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const r = await handleUserTokenRequest(body, request.headers, {
    verify: (b, headers) => verifySignedRequest<"user_token">(b, { scope: MINIAPP_SCOPE, actions: ["user_token"], headers }),
    getApp: async (ref) => {
      const a = await getApp(ref);
      return a ? { id: a.id, slug: a.slug, status: a.status } : null;
    },
    issuer: tokenKeysFromEnv()?.issuer ?? null,
    take: (wallet) => takeAll(limiters, wallet),
    nowSec: () => Math.floor(Date.now() / 1000),
    jti: () => randomUUID(),
  });
  return NextResponse.json(r.json, { status: r.status });
}
