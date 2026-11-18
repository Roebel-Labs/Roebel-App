import { NextRequest, NextResponse } from "next/server";
import { verifySignedRequest } from "@/lib/signed-request/verify";
import { MINIAPP_SCOPE } from "@/lib/signed-request/message";
import { createAdminClient } from "@/lib/supabase/admin";
import { roleInAccount } from "@/lib/tickets/authz";
import { getApp, listOrgBindingApps, setOrgBinding } from "@/lib/miniapp/data";
import { handleOrgBinding, type OrgBindingAction } from "@/lib/miniapp/orgBindingHandler";
import { sharedLimiters } from "@/lib/rate-limit/server";
import { MINUTE_MS, takeAll } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiters = sharedLimiters([{ name: "miniapp-org-binding-ip", limit: 60, windowMs: MINUTE_MS }]);

/**
 * An org's owner or admin lists the mini apps that name the org and confirms, rejects or
 * removes the binding (signed request, roebel-miniapp-v1).
 */
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await takeAll(limiters, ip))) {
    return NextResponse.json({ ok: false, code: "rate_limited" }, { status: 429 });
  }
  const body = await request.json().catch(() => null);
  try {
    const r = await handleOrgBinding(body, request.headers, {
      verify: (b, headers) =>
        verifySignedRequest<OrgBindingAction>(b, {
          scope: MINIAPP_SCOPE,
          actions: ["org_binding_list", "org_binding_decide"],
          headers,
        }),
      roleOf: (account, wallet) => roleInAccount(createAdminClient(), account, wallet),
      listApps: listOrgBindingApps,
      getApp: async (ref) => {
        const a = await getApp(ref);
        return a ? { id: a.id, org_account_id: a.org_account_id ?? null, org_binding: a.org_binding ?? "none" } : null;
      },
      setBinding: setOrgBinding,
    });
    return NextResponse.json(r.json, { status: r.status });
  } catch (e) {
    console.error("[mini-apps/org-binding] failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, code: "internal" }, { status: 500 });
  }
}
