// GET /api/mini-apps/rankings — public "Beliebte Apps" ranking (7-day active
// users per published app). No auth: only aggregate counts, no wallets.
import { NextResponse } from "next/server";
import { queryAppRankings } from "@/lib/miniapp";
import { jsonError } from "@/lib/miniapp/http";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const rankings = await queryAppRankings(7);
    return NextResponse.json(rankings, {
      headers: { "cache-control": "public, max-age=60, s-maxage=300" },
    });
  } catch (e) {
    return jsonError(e);
  }
}
