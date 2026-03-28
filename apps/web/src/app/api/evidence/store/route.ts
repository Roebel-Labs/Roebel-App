import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * POST /api/evidence/store
 *
 * Store verification evidence in Supabase after successful blockchain transaction
 * IMPORTANT: Supports ENCRYPTED evidence for GDPR compliance
 * - Encrypted evidence: stores only encrypted blob + public metadata
 * - Legacy evidence: stores plaintext (backward compatibility)
 * Uses Supabase anon key (same pattern as proposals)
 */
export async function POST(request: NextRequest) {
  console.log("📝 [API] Evidence store request received");

  try {
    const body = await request.json();
    const {
      requestId,
      contractType,
      irysId,
      irysUrl,
      // Legacy format (backward compatibility)
      name,
      address,
      reason,
      requester,
      type,
      // New encrypted format
      evidencePayload, // Contains encrypted evidence OR legacy data
      isEncrypted,
    } = body;

    console.log("🔍 [API] Evidence details:");
    console.log("  - Request ID:", requestId);
    console.log("  - Contract Type:", contractType);
    console.log("  - Irys ID:", irysId);
    console.log("  - Is Encrypted:", isEncrypted);
    console.log("  - Requester:", requester);

    // Validate required fields
    if (!requestId || !contractType || !irysId || !irysUrl) {
      console.error("❌ [API] Missing required fields");
      return NextResponse.json(
        { error: "Missing required fields: requestId, contractType, irysId, irysUrl" },
        { status: 400 }
      );
    }

    // Validate contractType
    if (contractType !== "citizen" && contractType !== "attester") {
      console.error("❌ [API] Invalid contract type");
      return NextResponse.json(
        { error: "Invalid contract type. Must be 'citizen' or 'attester'" },
        { status: 400 }
      );
    }

    let evidenceData;
    let encryptionVersion = null;

    // Handle encrypted evidence (NEW FORMAT)
    if (isEncrypted && evidencePayload) {
      console.log("🔒 [API] Processing ENCRYPTED evidence");

      // Validate encrypted structure
      if (
        !evidencePayload.encrypted ||
        !evidencePayload.metadata ||
        !evidencePayload.encrypted.ciphertext ||
        !evidencePayload.encrypted.nonce
      ) {
        console.error("❌ [API] Invalid encrypted evidence structure");
        return NextResponse.json(
          { error: "Invalid encrypted evidence structure" },
          { status: 400 }
        );
      }

      // SECURITY: Ensure no plaintext PII in encrypted evidence
      if (evidencePayload.name || evidencePayload.address) {
        console.error("❌ [API] SECURITY VIOLATION: Plaintext PII in encrypted evidence!");
        return NextResponse.json(
          { error: "Cannot store plaintext PII with encrypted evidence" },
          { status: 400 }
        );
      }

      evidenceData = evidencePayload; // Store full encrypted payload
      encryptionVersion = "1";
      console.log("✓ [API] Encrypted evidence validated (no PII leak)");
    }
    // Handle legacy plaintext evidence (BACKWARD COMPATIBILITY)
    else {
      console.log("📄 [API] Processing PLAINTEXT evidence (legacy)");

      // Validate legacy required fields
      if (!name || !requester) {
        console.error("❌ [API] Missing required fields for legacy evidence");
        return NextResponse.json(
          { error: "Missing required fields: name, requester" },
          { status: 400 }
        );
      }

      evidenceData = {
        name,
        address,
        reason,
        type,
        requester,
        timestamp: new Date().toISOString(),
      };
    }

    console.log("💾 [API] Storing in Supabase...");

    // Determine encryption version from evidencePayload if encrypted
    if (isEncrypted && evidencePayload?.metadata?.encryptionVersion) {
      // Map 'eip712-v1' or 'eip712-v2' to simple version numbers
      if (evidencePayload.metadata.encryptionVersion === 'eip712-v2') {
        encryptionVersion = '2';
      } else {
        encryptionVersion = '1';
      }
    }

    // Insert into Supabase with all new columns
    const { data, error } = await supabase
      .from("request_evidence")
      .insert({
        request_id: requestId,
        contract_type: contractType,
        requester_address: evidenceData.requester || evidenceData.metadata?.requester || requester,
        irys_id: irysId,
        irys_url: irysUrl,
        evidence_data: evidenceData,
        is_encrypted: isEncrypted || false,
        encryption_version: encryptionVersion,
        status: 'pending', // Initial status
        nft_type: contractType, // 'citizen' or 'attester'
        attester_signatures: 0, // Initial signature count
        citizen_signatures: 0, // Initial signature count
      })
      .select()
      .single();

    if (error) {
      console.error("❌ [API] Supabase insert error:", error);
      return NextResponse.json(
        { error: "Failed to store evidence", details: error.message },
        { status: 500 }
      );
    }

    console.log("✅ [API] Evidence stored successfully!");
    console.log("🔗 [API] Irys URL:", irysUrl);
    if (isEncrypted) {
      console.log("🔒 [API] Personal data ENCRYPTED and GDPR-compliant!");
    }

    return NextResponse.json({
      success: true,
      data,
      message: isEncrypted
        ? "Encrypted evidence stored successfully"
        : "Evidence stored successfully",
    });
  } catch (error) {
    console.error("❌ [API] Unexpected error:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    return NextResponse.json(
      { error: "Failed to store evidence", details: errorMessage },
      { status: 500 }
    );
  }
}
