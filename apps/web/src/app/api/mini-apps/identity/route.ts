import { NextRequest, NextResponse } from "next/server";
import { verifySignedRequest } from "@/lib/signed-request/verify";
import { MINIAPP_SCOPE } from "@/lib/signed-request/message";
import { createAdminClient } from "@/lib/supabase/admin";
import { getApp } from "@/lib/miniapp/data";
import { getCredentialSource } from "@/lib/miniapp/credentialSource";
import { supabaseGrantStore } from "@/lib/miniapp/grants";
import { subjectSecretFromEnv } from "@/lib/miniapp/subject";
import { handleIdentityRequest, type IdentityAction } from "@/lib/miniapp/identityHandler";
import { sharedLimiters } from "@/lib/rate-limit/server";
import { MINUTE_MS, takeAll } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiters = sharedLimiters([{ name: "miniapp-identity-wallet", limit: 60, windowMs: MINUTE_MS }]);

/** Per-app pseudonym + consent grants for version-2 mini apps (signed request, roebel-miniapp-v1). */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const secret = subjectSecretFromEnv();
  try {
    const r = await handleIdentityRequest(body, request.headers, {
      verify: (b, headers) =>
        verifySignedRequest<IdentityAction>(b, { scope: MINIAPP_SCOPE, actions: ["identity_get", "identity_set"], headers }),
      getApp: async (ref) => {
        const a = await getApp(ref);
        if (!a) return null;
        const v2 = a.manifest_version === "2";
        return {
          id: a.id,
          slug: a.slug,
          status: a.status,
          manifestVersion: v2 ? "2" : "1",
          identity: v2 ? (a.identity ?? null) : null,
        };
      },
      store: secret ? supabaseGrantStore(createAdminClient(), secret) : null,
      credentials: getCredentialSource(),
      take: (wallet) => takeAll(limiters, wallet),
    });
    return NextResponse.json(r.json, { status: r.status });
  } catch (e) {
    console.error("[mini-apps/identity] failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, code: "internal" }, { status: 500 });
  }
}
