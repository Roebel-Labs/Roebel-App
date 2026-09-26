import { NextResponse } from "next/server";
import { buildInspiration } from "@/lib/chat/inspiration/load";
import { parseAudienceQuery } from "@/lib/chat/inspiration/signals";
import { handleError, requireWallet, unauthorized } from "../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/chat/inspiration?audience=me|org:<id>|org&orgId=<id> — "Für dich" cards.
 * Returns { audiences, audienceKey, tier, tasks } (see lib/chat/inspiration/load.ts).
 */
export async function GET(request: Request) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  try {
    const url = new URL(request.url);
    const target = parseAudienceQuery(url.searchParams.get("audience"), url.searchParams.get("orgId"));
    return NextResponse.json(await buildInspiration(wallet, target));
  } catch (err) {
    return handleError(err, "inspiration");
  }
}
