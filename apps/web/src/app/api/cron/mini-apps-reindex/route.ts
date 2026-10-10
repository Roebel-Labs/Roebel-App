// Daily re-index of every self-hosted mini-app manifest (spec §5).
import { NextRequest, NextResponse } from "next/server";
import { reindexAll } from "@/lib/miniapp/indexing";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await reindexAll());
}
