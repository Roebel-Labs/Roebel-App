import { NextResponse } from "next/server";
import * as store from "@/lib/chat/store";
import { checkQuota } from "@/lib/chat/runtime";
import { handleError, requireWallet, unauthorized } from "../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

/** GET /api/chat/bootstrap — presets, own bots, threads, tier + quota. */
export async function GET(request: Request) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  try {
    const [presets, bots, threads, quota] = await Promise.all([
      store.listPresetBots(),
      store.listUserBots(wallet),
      store.listThreads(wallet),
      checkQuota(wallet),
    ]);
    return NextResponse.json({ presets, bots, threads, tier: quota.tier, quota: { used: quota.used, limit: quota.limit } });
  } catch (err) {
    return handleError(err, "bootstrap");
  }
}
