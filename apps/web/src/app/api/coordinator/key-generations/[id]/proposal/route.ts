import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  verifyIsFounder,
  verifyWalletSignature,
} from "@/lib/shamir/signature-verification";
import { buildProposalAttachSignaturePayload } from "@/lib/shamir/canonical-payload";

/**
 * PATCH /api/coordinator/key-generations/[id]/proposal
 *
 * Attach the on-chain proposalId + the setCoordinatorPubKey tx hash to
 * a previously-created generation row. Called once the propose() tx
 * has been mined.
 *
 * Body:
 *   creatorWallet: 0x… (must be on the founder allowlist)
 *   signature:     ECDSA signature over the proposal-attach payload
 *   proposalId:    the uint256 returned by governor.propose
 *   setPubkeyTxHash: 0x… of the propose() tx itself
 */
export async function PATCH(
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

  const { creatorWallet, signature, proposalId, setPubkeyTxHash } = body as {
    creatorWallet?: string;
    signature?: string;
    proposalId?: string;
    setPubkeyTxHash?: string;
  };

  if (!creatorWallet || !signature || !proposalId || !setPubkeyTxHash) {
    return NextResponse.json(
      { error: "missing required fields" },
      { status: 400 }
    );
  }

  if (!verifyIsFounder(creatorWallet)) {
    return NextResponse.json(
      { error: "creatorWallet is not on the founder allowlist" },
      { status: 403 }
    );
  }

  const message = buildProposalAttachSignaturePayload(
    generationId,
    proposalId,
    setPubkeyTxHash
  );
  if (!verifyWalletSignature(message, signature, creatorWallet)) {
    return NextResponse.json(
      { error: "signature does not match creatorWallet" },
      { status: 401 }
    );
  }

  const supabase = createAdminClient();
  const { error: updateErr } = await supabase
    .from("coordinator_key_generations")
    .update({
      proposal_id: proposalId,
      set_pubkey_tx_hash: setPubkeyTxHash,
    })
    .eq("id", generationId);
  if (updateErr) {
    console.error(
      "[key-generations/[id]/proposal] update failed",
      updateErr
    );
    return NextResponse.json(
      { error: updateErr.message },
      { status: 500 }
    );
  }

  await supabase.from("coordinator_audit_log").insert({
    event_type: "pubkey_set_proposed",
    actor_wallet: creatorWallet.toLowerCase(),
    target_id: generationId,
    payload: { proposalId, setPubkeyTxHash },
    tx_hash: setPubkeyTxHash,
  });

  return NextResponse.json({ ok: true });
}
