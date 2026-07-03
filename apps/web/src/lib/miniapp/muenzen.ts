// On-chain Röbel-Münzen issuance for mini-app reward grants — ISOLATED here so
// the rest of the reward pipeline (budget metering, idempotency, rate-limit,
// ledger) is independent of how coins actually move on Gnosis.
//
// ── Why this is isolated (INTEGRATION NEED) ─────────────────────────────────
// The existing payout rail is the `claim-reward` Supabase edge function, but it
// is VERIFIER-GATED: each `action` needs a hardcoded server-side verifier and it
// reads its amount from `reward_config`. Mini-app grants are arbitrary
// (app-declared amount + reason) and can't map onto those verifiers. The actual
// mint is a `HUB.safeTransferFrom(funder → recipient, GROUP_TOKEN_ID, amount)`,
// but the `FUNDER_PRIVKEY` lives ONLY in Supabase secrets — it must never enter
// the web app. So the correct production wiring is a NEW edge function
// (`miniapp-grant-reward`) that takes an already-authorized { wallet, amountAtto,
// ref } and performs the transfer, mirroring claim-reward's step 5.
//
// Until that edge function ships, `issueMuenzenOnChain` looks for it and invokes
// it if present; otherwise it returns { onChain: false } and the caller still
// records the ledger row (status stays 'pending' so an operator can settle it).
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { numberToAtto } from "@/lib/muenzen/constants";

export interface IssueResult {
  /** true when coins actually moved on-chain */
  onChain: boolean;
  txRef?: string;
  /** set when the on-chain rail is unavailable / not yet wired */
  note?: string;
}

/**
 * Move `amount` whole Röbel-Münzen to `wallet` on Gnosis via the funder rail.
 *
 * Delegates to the (future) `miniapp-grant-reward` edge function so the funder
 * key stays in Supabase. When that function isn't deployed, resolves
 * { onChain:false } — the ledger row is still written by the caller and can be
 * settled later.
 */
export async function issueMuenzenOnChain(params: {
  wallet: string;
  amount: number;
  reason: string;
  /** ledger row id — the edge fn should use it for its own idempotency. */
  ref: string;
}): Promise<IssueResult> {
  const { wallet, amount, reason, ref } = params;
  const amountAtto = numberToAtto(amount);

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.functions.invoke("miniapp-grant-reward", {
      body: { wallet, amountAtto, reason, ref },
    });

    // Edge function not deployed → Supabase returns a non-2xx / functions error.
    if (error) {
      return {
        onChain: false,
        note: `on-chain rail unavailable (miniapp-grant-reward not deployed): ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
    const res = data as { status?: string; txHash?: string; reason?: string } | null;
    if (res?.status === "paid" && res.txHash) {
      return { onChain: true, txRef: res.txHash };
    }
    return {
      onChain: false,
      note: res?.reason ? `on-chain issuance not settled: ${res.reason}` : "on-chain issuance not settled",
    };
  } catch (e) {
    return {
      onChain: false,
      note: `on-chain issuance error: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
