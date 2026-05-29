import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { currentContractAddress } from "@/lib/verification-contracts";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const requestId = params.id;
    const { searchParams } = new URL(request.url);
    const contractType = searchParams.get("contract");

    // Validate parameters
    if (!requestId) {
      return NextResponse.json(
        { error: "Missing request ID" },
        { status: 400 }
      );
    }

    if (!contractType || (contractType !== "citizen" && contractType !== "attester")) {
      return NextResponse.json(
        { error: "Invalid or missing contract type" },
        { status: 400 }
      );
    }

    // Fetch from Supabase, scoped to the current contract address so legacy
    // rows from archived contracts are not returned.
    const { data, error } = await supabase
      .from("request_evidence")
      .select("*")
      .eq("request_id", requestId)
      .eq("contract_type", contractType)
      .eq("contract_address", currentContractAddress(contractType))
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // No rows returned
        return NextResponse.json(
          { error: "Evidence not found" },
          { status: 404 }
        );
      }
      console.error("❌ [API] Supabase query error:", error);
      return NextResponse.json(
        { error: "Failed to fetch evidence", details: error.message },
        { status: 500 }
      );
    }

    console.log("✅ [API] Evidence fetched from Supabase:", data);

    return NextResponse.json({
      success: true,
      data: data.evidence_data,
      irysId: data.irys_id,
      irysUrl: data.irys_url,
      createdAt: data.created_at,
    });
  } catch (error) {
    console.error("❌ [API] Error fetching evidence:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}
