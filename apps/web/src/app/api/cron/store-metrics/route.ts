import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAppleDownloads, type StoreDailyRow } from "@/lib/store/apple";
import { fetchGoogleInstalls } from "@/lib/store/google";

export const runtime = "nodejs";
export const maxDuration = 60;

type Platform = "ios" | "android";

async function upsertRows(
  platform: Platform,
  source: string,
  rows: StoreDailyRow[]
): Promise<number> {
  if (rows.length === 0) return 0;
  const supabase = createAdminClient();
  const payload = rows.map((r) => ({
    platform,
    date: r.date,
    downloads: r.downloads,
    cumulative_total: r.cumulative_total ?? null,
    source,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase
    .from("store_metrics")
    .upsert(payload, { onConflict: "platform,date" });
  if (error) {
    console.error(`[cron/store-metrics] upsert ${platform} failed:`, error);
    return 0;
  }
  return payload.length;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [apple, google] = await Promise.all([
      fetchAppleDownloads(60),
      fetchGoogleInstalls(),
    ]);

    const [iosCount, androidCount] = await Promise.all([
      upsertRows("ios", "appstore_sales", apple),
      upsertRows("android", "play_gcs", google),
    ]);

    return NextResponse.json({
      success: true,
      ios: iosCount,
      android: androidCount,
    });
  } catch (error) {
    console.error("[cron/store-metrics] error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
