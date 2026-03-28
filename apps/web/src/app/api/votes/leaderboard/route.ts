import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * GET /api/votes/leaderboard?limit=10
 * Get voting leaderboard
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") || "10");

  console.log("🏆 [API] Fetching voting leaderboard (limit:", limit, ")");

  try {
    // Call the Postgres function to get leaderboard
    const { data, error } = await supabase.rpc("get_voting_leaderboard", {
      p_limit: limit,
    });

    if (error) {
      console.error("❌ [API] Error fetching leaderboard:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`✅ [API] Leaderboard fetched: ${data?.length || 0} entries`);

    return NextResponse.json({
      success: true,
      leaderboard: data || [],
    });
  } catch (error) {
    console.error("❌ [API] Unexpected error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch leaderboard",
      },
      { status: 500 }
    );
  }
}
