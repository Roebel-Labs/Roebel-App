import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/coordinator/state
 *
 * Aggregator for the status dashboard. Returns:
 *   registrations:       all currently-active share-key registrations
 *   activeGeneration:    the most recent activated key generation (if any)
 *   latestGenerations:   the 10 most recent generations (any state)
 *   recentAuditLog:      the 20 most recent audit rows
 *
 * Bundled into a single endpoint so the page only does one fetch.
 */
export async function GET() {
  const supabase = createAdminClient();

  const [regsRes, activeRes, latestRes, auditRes, sessionsRes] = await Promise.all([
    supabase
      .from("coordinator_share_keys")
      .select("wallet_address, registered_at")
      .is("revoked_at", null)
      .order("registered_at", { ascending: true }),
    supabase
      .from("coordinator_key_generations")
      .select(
        "id, governor_address, pubkey_x, pubkey_y, threshold, total_shares, created_by_wallet, created_at, proposal_id, set_pubkey_tx_hash, activated_at, superseded_at"
      )
      .not("activated_at", "is", null)
      .is("superseded_at", null)
      .order("activated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("coordinator_key_generations")
      .select(
        "id, pubkey_x, pubkey_y, threshold, total_shares, created_at, proposal_id, set_pubkey_tx_hash, activated_at, superseded_at"
      )
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("coordinator_audit_log")
      .select("id, event_type, actor_wallet, target_id, tx_hash, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("coordinator_sessions")
      .select("id, poll_id, state, submitted_shares_count, expires_at, created_at, completed_at")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  if (regsRes.error) {
    console.error("[coordinator/state] regs", regsRes.error);
    return NextResponse.json({ error: regsRes.error.message }, { status: 500 });
  }
  if (latestRes.error) {
    console.error("[coordinator/state] latest", latestRes.error);
  }
  if (auditRes.error) {
    console.error("[coordinator/state] audit", auditRes.error);
  }

  return NextResponse.json({
    registrations:
      regsRes.data?.map((r) => ({
        walletAddress: r.wallet_address,
        registeredAt: r.registered_at,
      })) ?? [],
    activeGeneration: activeRes.data ?? null,
    latestGenerations: latestRes.data ?? [],
    recentAuditLog: auditRes.data ?? [],
    recentSessions: sessionsRes.data ?? [],
  });
}
