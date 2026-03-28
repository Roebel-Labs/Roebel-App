import { NextRequest, NextResponse } from "next/server";
import { createProposal, getLatestProposalNumber } from "@/lib/supabase";
import type { CreateProposalInput, ProposalContent } from "@/lib/proposal-types";
import { calculateReadingTime, extractSummary } from "@/lib/proposal-types";
import { createAppNotification } from "@/app/actions/app-notifications";

/**
 * POST /api/proposals/store
 *
 * Store a proposal in Supabase after it's been created on-chain
 * This ensures fast retrieval and rich querying capabilities
 */
export async function POST(request: NextRequest) {
  console.log("📝 [API] Proposal store request received");

  try {
    // Parse request body
    const body = await request.json();
    const {
      proposalId,
      blockchainProposalId,
      title,
      markdown,
      irysContentId,
      irysUrl,
      transactionHash,
      proposerAddress,
      blockNumber,
      snapshotBlock,
      deadlineBlock,
      category,
    } = body;

    console.log("🔍 [API] Proposal details:");
    console.log("  - Proposal ID (hash):", proposalId);
    console.log("  - Blockchain Proposal ID (numeric):", blockchainProposalId);
    console.log("  - Title:", title);
    console.log("  - Proposer:", proposerAddress);
    console.log("  - Transaction:", transactionHash);

    // Validate required fields
    if (!proposalId || !blockchainProposalId || !title || !markdown) {
      console.error("❌ [API] Missing required fields");
      return NextResponse.json(
        { error: "Missing required fields: proposalId, blockchainProposalId, title, markdown" },
        { status: 400 }
      );
    }

    if (!irysContentId || !irysUrl) {
      console.error("❌ [API] Missing Irys data");
      return NextResponse.json(
        { error: "Missing Irys storage data" },
        { status: 400 }
      );
    }

    if (!transactionHash || !proposerAddress) {
      console.error("❌ [API] Missing blockchain data");
      return NextResponse.json(
        { error: "Missing blockchain data" },
        { status: 400 }
      );
    }

    // Get next proposal number
    console.log("🔢 [API] Getting latest proposal number...");
    const latestNumber = await getLatestProposalNumber();
    const proposalNumber = latestNumber + 1;
    console.log("📊 [API] New proposal number:", proposalNumber);

    // Create proposal content structure
    const wordCount = markdown.split(/\s+/).length;
    const readingTime = calculateReadingTime(markdown);
    const summary = extractSummary(markdown);

    const content: ProposalContent = {
      markdown,
      version: "1.0",
      metadata: {
        wordCount,
        estimatedReadTime: readingTime,
      },
    };

    console.log("📄 [API] Content metadata:");
    console.log("  - Word count:", wordCount);
    console.log("  - Reading time:", readingTime, "minutes");
    console.log("  - Summary length:", summary.length, "characters");

    // Prepare proposal input
    const proposalInput: CreateProposalInput = {
      proposal_id: proposalId,
      blockchain_proposal_id: blockchainProposalId,
      proposal_number: proposalNumber,
      title,
      summary,
      content,
      category: category || "general",
      irys_content_id: irysContentId,
      irys_url: irysUrl,
      transaction_hash: transactionHash,
      proposer_address: proposerAddress,
      block_number: BigInt(blockNumber || 0),
      snapshot_block: BigInt(snapshotBlock || 0),
      deadline_block: BigInt(deadlineBlock || 0),
    };

    // Store in Supabase
    console.log("💾 [API] Storing proposal in Supabase...");
    const result = await createProposal(proposalInput);

    if (!result.success) {
      console.error("❌ [API] Failed to store proposal:", result.error);
      return NextResponse.json(
        {
          error: "Failed to store proposal",
          details: result.error,
        },
        { status: 500 }
      );
    }

    console.log("✅ [API] Proposal stored successfully!");
    console.log("🔗 [API] Proposal URL: /proposals/" + proposalId);

    // Create activity notification
    createAppNotification({
      type: "proposal_new",
      title: `Neuer Vorschlag: ${title}`,
      body: summary?.substring(0, 120) || null,
      link: `/app/proposals/${proposalId}`,
      reference_id: proposalId,
    }).catch(console.error);
    // Note: no image_url for proposals - uses default icon

    return NextResponse.json({
      success: true,
      proposal: result.data,
      message: "Proposal stored successfully",
    });
  } catch (error) {
    console.error("❌ [API] Unexpected error:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    return NextResponse.json(
      {
        error: "Failed to store proposal",
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}
