import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/coordinator/sessions/[id]
 *
 * Returns the session row + the associated key-generation row (we need the
 * shareholder list for the tally page to know which wallet should decrypt
 * which share). Public — no auth — because the session pubkey + signature
 * are public commitments and the encrypted-share rows are also public-safe.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: session, error: sessErr } = await supabase
    .from("coordinator_sessions")
    .select(
      "id, key_generation_id, governor_address, poll_id, reconstructor_session_pubkey, reconstructor_session_signature, reconstructor_host, expires_at, state, submitted_shares_count, created_at, completed_at, tally_tx_hash"
    )
    .eq("id", id)
    .maybeSingle();
  if (sessErr) {
    console.error("[sessions/[id]] select failed", sessErr);
    return NextResponse.json({ error: sessErr.message }, { status: 500 });
  }
  if (!session) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { data: generation } = await supabase
    .from("coordinator_key_generations")
    .select(
      "id, governor_address, pubkey_x, pubkey_y, threshold, total_shares, created_at, activated_at"
    )
    .eq("id", session.key_generation_id)
    .maybeSingle();

  const { data: shares } = await supabase
    .from("coordinator_shares")
    .select("wallet_address, share_index, encrypted_share")
    .eq("key_generation_id", session.key_generation_id)
    .order("share_index", { ascending: true });

  const { data: submissions } = await supabase
    .from("coordinator_session_submissions")
    .select("wallet_address, submitted_at")
    .eq("session_id", id)
    .order("submitted_at", { ascending: true });

  return NextResponse.json({
    session,
    generation,
    shares: (shares ?? []).map((s) => ({
      walletAddress: s.wallet_address,
      shareIndex: s.share_index,
      encryptedShareBase64: byteaToBase64(s.encrypted_share as string),
    })),
    submissions: submissions ?? [],
  });
}

function byteaToBase64(value: string): string {
  if (!value) return "";
  if (value.startsWith("\\x")) {
    return Buffer.from(value.slice(2), "hex").toString("base64");
  }
  return value;
}
