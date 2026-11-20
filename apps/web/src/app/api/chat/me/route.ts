import { NextResponse } from "next/server";
import { loadProfile } from "@/lib/chat/harness/context";
import { checkQuota } from "@/lib/chat/runtime";
import { listProviderKeys } from "@/lib/chat/provider-keys";
import { handleError, requireWallet, unauthorized } from "../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/chat/me — who is signed in (display name, never the wallet), plan, quota, own keys. */
export async function GET(request: Request) {
  try {
    const wallet = await requireWallet(request);
    if (!wallet) return unauthorized();
    const [profile, quota, keys] = await Promise.all([loadProfile(wallet), checkQuota(wallet), listProviderKeys(wallet)]);
    return NextResponse.json({
      displayName: profile?.displayName ?? null,
      username: profile?.username ?? null,
      isCitizen: profile?.isCitizen ?? false,
      tier: quota.tier,
      quota: { used: quota.used, limit: quota.limit, ownKey: quota.ownKey },
      providerKeys: keys,
    });
  } catch (err) {
    return handleError(err, "me");
  }
}
