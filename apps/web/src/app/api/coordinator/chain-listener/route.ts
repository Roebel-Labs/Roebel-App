import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { createAdminClient } from "@/lib/supabase/admin";
import { MACI_INFRA } from "@/lib/maci-config";

/**
 * GET /api/coordinator/chain-listener
 *
 * Server-side poll runner (intended to be invoked by a Vercel cron, e.g.
 * every 5 minutes, via `vercel.json`'s `crons` block — see runbook).
 *
 * For every generation row that has a proposal_id but no activated_at,
 * we ask the Governor whether the proposal's state == 7 (Executed). If
 * yes, we PATCH activated_at = now() and supersede any prior active
 * generation. We also write a pubkey_set_executed audit row carrying the
 * tx hash from the ProposalExecuted log filter.
 *
 * No founder signature is required here — the chain itself is the source
 * of truth, and we only flip a single bit (`activated_at`) based on what
 * the Governor already says. Bad data on Supabase corrects itself on the
 * next poll cycle.
 *
 * Env:
 *   BASE_RPC_URL — JSON-RPC endpoint (same one apps/web uses)
 */
export async function GET() {
  const rpcUrl = process.env.BASE_RPC_URL;
  if (!rpcUrl) {
    return NextResponse.json(
      { error: "BASE_RPC_URL not configured" },
      { status: 500 }
    );
  }

  const supabase = createAdminClient();

  // Pull every generation that has a proposalId but is still waiting to be
  // activated. We intentionally include rows up to 90 days old so a late
  // execution still gets caught.
  const { data: pending, error: pendingErr } = await supabase
    .from("coordinator_key_generations")
    .select("id, governor_address, proposal_id")
    .is("activated_at", null)
    .not("proposal_id", "is", null)
    .gt(
      "created_at",
      new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    );
  if (pendingErr) {
    return NextResponse.json(
      { error: pendingErr.message },
      { status: 500 }
    );
  }
  if (!pending || pending.length === 0) {
    return NextResponse.json({ checked: 0, activated: 0 });
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, {
    batchMaxCount: 1,
  });

  const STATE_EXECUTED = 7;
  const activated: { generationId: string; proposalId: string }[] = [];

  for (const row of pending) {
    try {
      const governor = new ethers.Contract(
        row.governor_address,
        [
          "function state(uint256 proposalId) view returns (uint8)",
          "event ProposalExecuted(uint256 proposalId)",
        ],
        provider
      );
      const state: number = Number(
        await governor.state(BigInt(row.proposal_id))
      );
      if (state !== STATE_EXECUTED) continue;

      // Find the ProposalExecuted tx hash for this proposalId in the last
      // ~100k blocks (~3 days on Base at 2s/block). If we can't find it
      // we still mark activated and just leave tx_hash null.
      let txHash: string | null = null;
      try {
        const latest = await provider.getBlockNumber();
        const filter = governor.filters.ProposalExecuted(
          BigInt(row.proposal_id)
        );
        const logs = await governor.queryFilter(
          filter,
          Math.max(0, latest - 100_000),
          latest
        );
        if (logs.length > 0) {
          txHash = logs[logs.length - 1].transactionHash;
        }
      } catch (err) {
        console.warn("[chain-listener] queryFilter failed", err);
      }

      const now = new Date().toISOString();
      await supabase
        .from("coordinator_key_generations")
        .update({ superseded_at: now })
        .eq("governor_address", row.governor_address)
        .is("superseded_at", null)
        .not("activated_at", "is", null)
        .neq("id", row.id);

      await supabase
        .from("coordinator_key_generations")
        .update({ activated_at: now })
        .eq("id", row.id);

      await supabase.from("coordinator_audit_log").insert({
        event_type: "pubkey_set_executed",
        actor_wallet: null,
        target_id: row.id,
        payload: { proposalId: row.proposal_id, source: "chain-listener" },
        tx_hash: txHash,
      });

      activated.push({ generationId: row.id, proposalId: row.proposal_id });
    } catch (err) {
      console.error(
        `[chain-listener] failed to check generation ${row.id}`,
        err
      );
    }
  }

  return NextResponse.json({
    checked: pending.length,
    activated: activated.length,
    rows: activated,
  });
}
