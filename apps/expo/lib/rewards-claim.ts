// Client helper for the Röbel Münzen reward rail. Call this after a citizen completes a
// rewardable civic action; the claim-reward edge function verifies it server-side, ensures
// it pays at most once, and the funder sends Röbel Münzen to the actor's wallet.
//
// Payout goes to `wallet` (the actor) regardless of who calls, and is idempotent — so it's
// safe to call optimistically (e.g. right after a vote) and safe to retry.
import { supabase } from "@/lib/supabase";

export type RewardAction = "proposal_vote" | "event_submit" | "checkpoint" | "referral" | "event_attend";

export type ClaimResult =
  | { status: "paid"; amountAtto: string; txHash: string }
  | { status: "already_claimed" }
  | { status: "rejected"; reason?: string }
  | { status: "failed"; reason?: string };

/**
 * Claim a Röbel Münzen reward for a completed action.
 * @param wallet      the citizen's Gnosis wallet (the smart-account address)
 * @param action      a configured reward action
 * @param referenceId the thing being rewarded (proposalId, event id, …); required for per-reference actions
 */
export async function claimReward(
  wallet: string,
  action: RewardAction,
  referenceId?: string,
): Promise<ClaimResult> {
  try {
    const { data, error } = await supabase.functions.invoke("claim-reward", {
      body: { wallet, action, referenceId },
    });
    if (error) return { status: "failed", reason: error.message };
    return data as ClaimResult;
  } catch (e: any) {
    return { status: "failed", reason: e?.message ?? String(e) };
  }
}
