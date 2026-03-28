import { NextRequest, NextResponse } from "next/server";
import NodeIrys from "@irys/sdk";

/**
 * POST /api/irys/upload
 *
 * Server-side Irys upload endpoint
 * Uses a dedicated EOA wallet to sign uploads, avoiding smart wallet compatibility issues
 */
export async function POST(request: NextRequest) {
  console.log("📤 [API] Irys upload request received");

  try {
    // Parse request body
    const { content, tags, userAddress } = await request.json();

    console.log("🔍 [API] Upload details:");
    console.log("  - Content length:", content?.length || 0, "characters");
    console.log("  - User address:", userAddress);
    console.log("  - Tags count:", tags?.length || 0);

    // Validate inputs
    if (!content || typeof content !== "string") {
      console.error("❌ [API] Invalid content");
      return NextResponse.json(
        { error: "Content is required and must be a string" },
        { status: 400 }
      );
    }

    if (!userAddress || typeof userAddress !== "string") {
      console.error("❌ [API] Invalid user address");
      return NextResponse.json(
        { error: "User address is required" },
        { status: 400 }
      );
    }

    // Check for upload key
    const uploadPrivateKey = process.env.IRYS_UPLOAD_PRIVATE_KEY;
    if (!uploadPrivateKey) {
      console.error("❌ [API] IRYS_UPLOAD_PRIVATE_KEY not configured");
      return NextResponse.json(
        { error: "Server configuration error: Upload key not set" },
        { status: 500 }
      );
    }

    console.log("🔑 [API] Initializing Irys uploader with server wallet...");

    // Initialize NodeIrys with server wallet (EOA)
    // For Base L2, use 'base-eth' as the token
    const irys = new NodeIrys({
      network: "mainnet", // or "devnet" for testing
      token: "base-eth", // Base L2 ETH
      key: uploadPrivateKey,
    });

    console.log("✅ [API] Irys uploader initialized");
    console.log("📍 [API] Upload wallet address:", irys.address);

    // Add user info to tags for tracking
    const uploadTags = [
      ...(tags || []),
      { name: "Uploader", value: userAddress },
      { name: "Timestamp", value: Date.now().toString() },
      { name: "App-Version", value: "1.0.0" },
    ];

    console.log("🏷️  [API] Final tags:", uploadTags);

    // Upload to Irys
    console.log("⬆️  [API] Uploading to Irys...");
    const receipt = await irys.upload(content, { tags: uploadTags });

    const irysUrl = `https://gateway.irys.xyz/${receipt.id}`;

    console.log("✅ [API] Upload successful!");
    console.log("📋 [API] Receipt ID:", receipt.id);
    console.log("🔗 [API] Irys URL:", irysUrl);

    return NextResponse.json({
      success: true,
      id: receipt.id,
      url: irysUrl,
      receipt: {
        id: receipt.id,
        timestamp: receipt.timestamp,
        version: receipt.version,
      },
    });
  } catch (error) {
    console.error("❌ [API] Irys upload failed:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    return NextResponse.json(
      {
        error: "Upload failed",
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}
