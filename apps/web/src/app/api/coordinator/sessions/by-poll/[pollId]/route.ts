import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/coordinator/sessions/by-poll/[pollId]
 *
 * Returns the most recently opened tally session for a given pollId, plus
 * the full StateData payload (session row, key-generation row, encrypted
 * shares list, submitted shares). Public — no auth — same rationale as
 * /api/coordinator/sessions/[id]: session pubkey + manifest signature are
 * public commitments and the encrypted-share rows are safe to expose.
 *
 * The tally page used to scrape the audit log to find a session ID, which
 * broke as soon as we added a `session_trigger_requested` audit row whose
 * `target_id` is the pollId (not a UUID). Querying coordinator_sessions
 * directly by poll_id is the right contract.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ pollId: string }> }
) {
  const { pollId } = await params;
  if (!pollId) {
    return NextResponse.json({ error: "missing pollId" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Prefer an open session; fall back to the most recent if none open
  // (so the page can show "session expired" / "session completed" UX
  // instead of "no session found").
  const { data: openSession } = await supabase
    .from("coordinator_sessions")
    .select(
      "id, key_generation_id, governor_address, poll_id, reconstructor_session_pubkey, reconstructor_session_signature, reconstructor_host, expires_at, state, submitted_shares_count, created_at, completed_at, tally_tx_hash"
    )
    .eq("poll_id", pollId)
    .eq("state", "open")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let session = openSession;
  if (!session) {
    const { data: latestSession } = await supabase
      .from("coordinator_sessions")
      .select(
        "id, key_generation_id, governor_address, poll_id, reconstructor_session_pubkey, reconstructor_session_signature, reconstructor_host, expires_at, state, submitted_shares_count, created_at, completed_at, tally_tx_hash"
      )
      .eq("poll_id", pollId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    session = latestSession;
  }

  if (!session) {
    return NextResponse.json(
      { error: `no session found for poll ${pollId}` },
      { status: 404 }
    );
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
    .eq("session_id", session.id)
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
