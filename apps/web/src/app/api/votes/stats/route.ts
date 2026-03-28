import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * GET /api/votes/stats?wallet_address=0x...
 * Get voting statistics for a user
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const walletAddress = searchParams.get("wallet_address");

  if (!walletAddress) {
    return NextResponse.json(
      { error: "wallet_address parameter is required" },
      { status: 400 }
    );
  }

  console.log("📊 [API] Fetching voting stats for:", walletAddress);

  try {
    // Call the Postgres function to get stats
    const { data, error } = await supabase.rpc("get_user_voting_stats", {
      p_wallet_address: walletAddress,
    });

    if (error) {
      console.error("❌ [API] Error fetching stats:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log("✅ [API] Stats fetched successfully");

    return NextResponse.json({
      success: true,
      stats: data,
    });
  } catch (error) {
    console.error("❌ [API] Unexpected error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch stats",
      },
      { status: 500 }
    );
  }
}
