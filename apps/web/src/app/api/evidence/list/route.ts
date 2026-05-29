import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { currentContractAddress } from "@/lib/verification-contracts";

/**
 * GET /api/evidence/list?contract=citizen
 *
 * Fast endpoint to list all evidence for a contract type
 * Used for Supabase-first loading strategy (skip blockchain iteration)
 */
export async function GET(request: NextRequest) {
  console.log("📋 [API] Evidence list request received");

  try {
    const { searchParams } = new URL(request.url);
    const contractType = searchParams.get("contract");

    console.log("🔍 [API] Contract type:", contractType);

    // Validate contractType
    if (!contractType || (contractType !== "citizen" && contractType !== "attester")) {
      console.error("❌ [API] Invalid or missing contract type");
      return NextResponse.json(
        { error: "Invalid or missing contract type. Must be 'citizen' or 'attester'" },
        { status: 400 }
      );
    }

    console.log("💾 [API] Fetching evidence list from Supabase...");

    // Fetch all evidence for this contract type, scoped to the current contract
    // address so legacy rows from archived contracts are hidden.
    const { data, error } = await supabase
      .from("request_evidence")
      .select("request_id, contract_type, irys_id, irys_url, requester_address, evidence_data, created_at")
      .eq("contract_type", contractType)
      .eq("contract_address", currentContractAddress(contractType))
      .order("created_at", { ascending: false });

    if (error) {
      console.error("❌ [API] Supabase query error:", error);
      return NextResponse.json(
        { error: "Failed to fetch evidence list", details: error.message },
        { status: 500 }
      );
    }

    console.log(`✅ [API] Found ${data?.length || 0} evidence records`);

    return NextResponse.json({
      success: true,
      count: data?.length || 0,
      evidence: data || [],
    });
  } catch (error) {
    console.error("❌ [API] Unexpected error:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    return NextResponse.json(
      { error: "Failed to list evidence", details: errorMessage },
      { status: 500 }
    );
  }
}
