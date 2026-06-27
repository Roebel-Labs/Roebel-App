import { NextRequest, NextResponse } from "next/server";
import { createProposal, getLatestProposalNumber } from "@/lib/supabase";
import type { CreateProposalInput, ProposalContent } from "@/lib/proposal-types";
import { calculateReadingTime, extractSummary } from "@/lib/proposal-types";
import { createAppNotification } from "@/app/actions/app-notifications";
import { treasuryEuro } from "@/lib/muenzen/gnosis";

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
      attachTreasurySnapshot,
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

    const metadata: NonNullable<ProposalContent["metadata"]> = {
      wordCount,
      estimatedReadTime: readingTime,
    };

    // Opt-in: freeze the current Gemeinschaftskasse balance onto the proposal.
    // Captured server-side (tamper-proof). A read failure never blocks the
    // store — the proposal is already on-chain; it just lands without a snapshot.
    if (attachTreasurySnapshot) {
      try {
        const euro = await treasuryEuro();
        metadata.gemeinschaftskasse_snapshot = {
          euro,
          captured_at: new Date().toISOString(),
        };
        console.log("🐷 [API] Gemeinschaftskasse snapshot captured:", euro);
      } catch (snapErr) {
        console.warn("⚠️ [API] treasuryEuro failed; storing without snapshot", snapErr);
      }
    }

    const content: ProposalContent = {
      markdown,
      version: "1.0",
      metadata,
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

    // Notify everyone about the new proposal:
    //   (1) a BROADCAST push to all devices via the send-notification edge fn, and
    //   (2) an in-app notification row.
    // Both are best-effort — the proposal is already on-chain + stored, so a
    // notification failure must never fail the request.

    // (1) Broadcast push. Omitting `walletAddresses` makes send-notification fan
    // out to every active push token; its preference switch defaults to "send"
    // for unknown types, so no edge-function change is needed for `proposal_new`.
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (supabaseUrl && serviceKey) {
        const excerpt = (summary || "").replace(/\s+/g, " ").trim();
        const pushBody = excerpt
          ? excerpt.length > 140
            ? excerpt.slice(0, 140) + "…"
            : excerpt
          : "Jetzt abstimmen in der Röbel App";
        await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            type: "proposal_new",
            title: `Neue Bürgerumfrage: ${title}`,
            body: pushBody,
            data: { type: "proposal", proposalId },
          }),
        });
        console.log("📣 [API] Broadcast push sent for new proposal");
      } else {
        console.warn("⚠️ [API] Missing Supabase env — skipped proposal push");
      }
    } catch (pushErr) {
      console.error("⚠️ [API] Proposal push failed (non-fatal):", pushErr);
    }

    // (2) In-app notification (web notification hub).
    createAppNotification({
      type: "proposal_new",
      title: `Neue Bürgerumfrage: ${title}`,
      body: summary?.substring(0, 120) || null,
      link: `/app/proposals/${proposalId}`,
      reference_id: proposalId,
    }).catch(console.error);

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
