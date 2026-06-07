import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  verifyIsFounder,
  verifyWalletSignature,
} from "@/lib/shamir/signature-verification";

/**
 * POST /api/coordinator/key-generations/[id]/executed
 *
 * Marks a generation as activated on-chain and supersedes any prior active
 * generation in one DB transaction. Called from:
 *   (a) the status page "Mark as executed" button after the founder
 *       manually executes the rotation proposal, or
 *   (b) the ProposalExecuted chain listener at
 *       /api/coordinator/chain-listener once it sees the matching tx.
 *
 * Body:
 *   creatorWallet: 0x… (founder allowlist)
 *   signature: ECDSA sig over the per-generation message below
 *   executionTxHash: 0x… (the queue+execute tx; for audit only)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: generationId } = await params;
  if (!generationId) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { creatorWallet, signature, executionTxHash } = body as {
    creatorWallet?: string;
    signature?: string;
    executionTxHash?: string;
  };
  if (!creatorWallet || !signature || !executionTxHash) {
    return NextResponse.json(
      { error: "missing required fields" },
      { status: 400 }
    );
  }

  if (!verifyIsFounder(creatorWallet)) {
    return NextResponse.json(
      { error: "creatorWallet not on founder allowlist" },
      { status: 403 }
    );
  }

  const signedMessage = [
    "Roebel DAO coordinator rotation execution v1",
    `gen=${generationId}`,
    `tx=${executionTxHash}`,
  ].join("\n");
  if (!verifyWalletSignature(signedMessage, signature, creatorWallet)) {
    return NextResponse.json(
      { error: "signature does not match creatorWallet" },
      { status: 401 }
    );
  }

  const supabase = createAdminClient();

  // Fetch the generation to learn its governor_address.
  const { data: generation, error: genErr } = await supabase
    .from("coordinator_key_generations")
    .select("id, governor_address, activated_at")
    .eq("id", generationId)
    .maybeSingle();
  if (genErr || !generation) {
    return NextResponse.json(
      { error: genErr?.message ?? "generation not found" },
      { status: 404 }
    );
  }
  if (generation.activated_at) {
    return NextResponse.json({ ok: true, alreadyActivated: true });
  }

  const now = new Date().toISOString();

  // Mark prior active generations for this governor as superseded.
  const { error: supersedeErr } = await supabase
    .from("coordinator_key_generations")
    .update({ superseded_at: now })
    .eq("governor_address", generation.governor_address)
    .is("superseded_at", null)
    .not("activated_at", "is", null)
    .neq("id", generationId);
  if (supersedeErr) {
    console.error(
      "[key-generations/[id]/executed] supersede failed",
      supersedeErr
    );
    return NextResponse.json(
      { error: supersedeErr.message },
      { status: 500 }
    );
  }

  // Activate this one.
  const { error: activateErr } = await supabase
    .from("coordinator_key_generations")
    .update({ activated_at: now })
    .eq("id", generationId);
  if (activateErr) {
    console.error(
      "[key-generations/[id]/executed] activate failed",
      activateErr
    );
    return NextResponse.json(
      { error: activateErr.message },
      { status: 500 }
    );
  }

  await supabase.from("coordinator_audit_log").insert({
    event_type: "pubkey_set_executed",
    actor_wallet: creatorWallet.toLowerCase(),
    target_id: generationId,
    payload: { executionTxHash },
    tx_hash: executionTxHash,
  });

  return NextResponse.json({ ok: true });
}
