// Edge Function: claim-reward
// The Röbel Münzen payout rail (Phase 1). A citizen completes a civic action; this function
// VERIFIES it server-side, guarantees it pays at most ONCE (reward_claims unique row), then
// the funder hot wallet sends Röbel Münzen (ERC-1155) to the actor. Funds always go to the
// wallet that did the action — never the caller — so calling for someone else can't steal.
//
// Required Supabase secrets:
//   FUNDER_PRIVKEY  — the funder hot wallet's key (holds a small Münzen float + xDAI gas)
//   GNOSIS_RPC_URL  — a reliable Gnosis RPC (optional; defaults to rpc.gnosischain.com)
// Auto-provided: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Add a reward type = insert a reward_config row + a verifier below. Deploy via Supabase MCP.
import { createPublicClient, createWalletClient, http, getAddress } from "https://esm.sh/viem@2.21.0";
import { privateKeyToAccount } from "https://esm.sh/viem@2.21.0/accounts";
import { gnosis } from "https://esm.sh/viem@2.21.0/chains";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const HUB = "0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8";
const GROUP = "0xAc2CeCdBead594F97358a0d3132454f24F3E470c"; // Röbel Münzen group token
const GROUP_TOKEN_ID = BigInt(GROUP); // Circles encodes the token id as uint256(avatar)

const hubAbi = [
  { type: "function", name: "safeTransferFrom", stateMutability: "nonpayable", inputs: [
    { name: "from", type: "address" }, { name: "to", type: "address" },
    { name: "id", type: "uint256" }, { name: "value", type: "uint256" }, { name: "data", type: "bytes" },
  ], outputs: [] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [
    { name: "a", type: "address" }, { name: "id", type: "uint256" },
  ], outputs: [{ type: "uint256" }] },
] as const;

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" };

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// ── Verifiers: (wallet, referenceId) → { ok, reason? }. Add new actions here. ───────────
type Verdict = { ok: boolean; reason?: string };
type Verifier = (wallet: string, referenceId: string) => Promise<Verdict>;

const verifiers: Record<string, Verifier> = {
  // Rewards PARTICIPATION in a proposal vote — never the choice (no vote-buying). DB-backed
  // via vote_history; swaps to on-chain MACI participation once Gnosis governance is live.
  proposal_vote: async (wallet, ref) => {
    const { data, error } = await db
      .from("vote_history").select("id")
      .eq("proposal_id", ref).ilike("wallet_address", wallet).limit(1);
    if (error) return { ok: false, reason: "vote lookup failed" };
    return data && data.length ? { ok: true } : { ok: false, reason: "no vote found for this proposal" };
  },
  // Rewards submitting an event: the event's account must be owned by this wallet.
  event_submit: async (wallet, ref) => {
    const { data: ev } = await db.from("events").select("account_id").eq("id", ref).limit(1).maybeSingle();
    if (!ev?.account_id) return { ok: false, reason: "event not found" };
    const { data: own } = await db
      .from("account_owners").select("wallet_address")
      .eq("account_id", ev.account_id).ilike("wallet_address", wallet).limit(1);
    return own && own.length ? { ok: true } : { ok: false, reason: "event not owned by wallet" };
  },
  // Rewards completing an explorer checkpoint (ref = checkpoint id).
  checkpoint: async (wallet, ref) => {
    const { data } = await db.from("explorer_completions").select("id")
      .eq("checkpoint_id", ref).ilike("wallet_address", wallet).limit(1);
    return data && data.length ? { ok: true } : { ok: false, reason: "checkpoint not completed" };
  },
  // Rewards the REFERRER when someone redeems their invite. wallet = referrer (paid),
  // ref = the referred wallet (so the reward is once per invited person).
  referral: async (wallet, ref) => {
    const { data } = await db.from("referral_redemptions").select("id")
      .ilike("referrer_wallet", wallet).ilike("referred_wallet", ref).limit(1);
    return data && data.length ? { ok: true } : { ok: false, reason: "referral not found" };
  },
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json();
    const wallet = getAddress(body.wallet);
    const action = String(body.action ?? "");
    const refRaw = body.referenceId != null ? String(body.referenceId) : null;

    // 1) Config
    const { data: cfg } = await db.from("reward_config").select("*").eq("action", action).maybeSingle();
    if (!cfg) return json({ status: "rejected", reason: "unknown action" }, 400);
    if (!cfg.enabled) return json({ status: "rejected", reason: "action disabled" }, 403);
    if (cfg.per_reference && !refRaw) return json({ status: "rejected", reason: "referenceId required" }, 400);

    const reference = cfg.per_reference ? refRaw! : action; // sentinel keeps the unique index meaningful
    const amountAtto = BigInt(cfg.amount_atto);

    // 2) Daily cap (before reserving the row)
    if (cfg.daily_cap != null) {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { count } = await db.from("reward_claims")
        .select("id", { count: "exact", head: true })
        .eq("wallet", wallet).eq("action", action).neq("status", "rejected").gte("created_at", since);
      if ((count ?? 0) >= cfg.daily_cap) return json({ status: "rejected", reason: "daily cap reached" }, 429);
    }

    // 3) Reserve the claim — the unique index is the lock (race-safe, no double-pay)
    const { data: claim, error: insErr } = await db.from("reward_claims")
      .insert({ wallet, action, reference_id: reference, amount_atto: amountAtto.toString(), status: "pending" })
      .select("id").single();
    if (insErr) {
      if ((insErr as any).code === "23505") return json({ status: "already_claimed" });
      return json({ status: "rejected", reason: "could not record claim" }, 500);
    }
    const claimId = claim.id;

    // 4) Verify
    const verifier = verifiers[action];
    const verdict = verifier ? await verifier(wallet, reference) : { ok: false, reason: "no verifier" };
    if (!verdict.ok) {
      await db.from("reward_claims").update({ status: "rejected", error: verdict.reason }).eq("id", claimId);
      return json({ status: "rejected", reason: verdict.reason }, 403);
    }

    // 5) Pay
    const pk = Deno.env.get("FUNDER_PRIVKEY");
    if (!pk) {
      await db.from("reward_claims").update({ status: "failed", error: "funder not configured" }).eq("id", claimId);
      return json({ status: "failed", reason: "funder not configured" }, 500);
    }
    const rpc = Deno.env.get("GNOSIS_RPC_URL") || "https://rpc.gnosischain.com";
    const account = privateKeyToAccount(pk.startsWith("0x") ? pk : `0x${pk}`);
    const pub = createPublicClient({ chain: gnosis, transport: http(rpc) });
    const funderBal = await pub.readContract({ address: HUB, abi: hubAbi, functionName: "balanceOf", args: [account.address, GROUP_TOKEN_ID] }) as bigint;
    if (funderBal < amountAtto) {
      await db.from("reward_claims").update({ status: "failed", error: "insufficient funder float" }).eq("id", claimId);
      return json({ status: "failed", reason: "insufficient funder float" }, 503);
    }
    const wallet_ = createWalletClient({ account, chain: gnosis, transport: http(rpc) });
    const hash = await wallet_.writeContract({ address: HUB, abi: hubAbi, functionName: "safeTransferFrom", args: [account.address, wallet, GROUP_TOKEN_ID, amountAtto, "0x"] });
    await pub.waitForTransactionReceipt({ hash });

    await db.from("reward_claims").update({ status: "paid", tx_hash: hash, paid_at: new Date().toISOString() }).eq("id", claimId);
    await db.from("funder_ledger").insert({ direction: "payout", wallet, amount_atto: amountAtto.toString(), ref: claimId, tx_hash: hash });

    return json({ status: "paid", amountAtto: amountAtto.toString(), txHash: hash });
  } catch (e) {
    return json({ status: "failed", reason: String((e as Error)?.message ?? e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
