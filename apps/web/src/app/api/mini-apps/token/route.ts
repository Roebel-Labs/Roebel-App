import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { verifySignedRequest } from "@/lib/signed-request/verify";
import { MINIAPP_SCOPE } from "@/lib/signed-request/message";
import { getApp } from "@/lib/miniapp/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCredentialSource } from "@/lib/miniapp/credentialSource";
import { supabaseGrantStore } from "@/lib/miniapp/grants";
import { subjectSecretFromEnv } from "@/lib/miniapp/subject";
import { tokenKeysFromEnv } from "@/lib/miniapp/userToken";
import { handleUserTokenRequest } from "@/lib/miniapp/userTokenHandler";
import { sharedLimiters } from "@/lib/rate-limit/server";
import { MINUTE_MS, takeAll } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiters = sharedLimiters([{ name: "miniapp-token-wallet", limit: 30, windowMs: MINUTE_MS }]);

/** Display name (else username) and picture for a version-2 app the person granted `profile`. */
async function profileOf(wallet: string): Promise<{ name?: string; picture?: string } | null> {
  const { data, error } = await createAdminClient()
    .from("users")
    .select("display_name, username, profile_picture_url")
    .eq("wallet_address", wallet.toLowerCase())
    .maybeSingle();
  if (error || !data) return null;
  const pick = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const name = pick(data.display_name) ?? pick(data.username);
  const picture = pick(data.profile_picture_url);
  return { ...(name ? { name } : {}), ...(picture ? { picture } : {}) };
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const secret = subjectSecretFromEnv();
  try {
    const r = await handleUserTokenRequest(body, request.headers, {
      verify: (b, headers) => verifySignedRequest<"user_token">(b, { scope: MINIAPP_SCOPE, actions: ["user_token"], headers }),
      getApp: async (ref) => {
        const a = await getApp(ref);
        if (!a) return null;
        const v2 = a.manifest_version === "2";
        return {
          id: a.id,
          slug: a.slug,
          status: a.status,
          manifest_version: v2 ? "2" : "1",
          identity: v2 ? (a.identity ?? null) : null,
        };
      },
      issuer: tokenKeysFromEnv()?.issuer ?? null,
      grants: secret ? supabaseGrantStore(createAdminClient(), secret) : null,
      credentials: getCredentialSource(),
      profile: profileOf,
      take: (wallet) => takeAll(limiters, wallet),
      nowSec: () => Math.floor(Date.now() / 1000),
      jti: () => randomUUID(),
    });
    return NextResponse.json(r.json, { status: r.status });
  } catch (e) {
    console.error("[mini-apps/token] failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, code: "internal" }, { status: 500 });
  }
}
