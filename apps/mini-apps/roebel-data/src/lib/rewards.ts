// Röbel-Münzen (Netizen `roebel` extension) for the Röbel Circles mini app.
//
// Two host-authorized capabilities:
//  • getMuenzenBalance() — the connected user's Röbel-Münzen balance (symbol RÖ).
//  • grantReward()       — REQUEST a small reward for a civic action. The host
//    backend meters the per-app budget, rate-limits, and dedupes on the
//    idempotency key; an unreviewed app has budget 0 → every request rejects.
//
// Copy rule (DESIGN.md §5): the currency is "Röbel-Münzen" / "RÖ" — never CRC,
// never Circles, never "token", and never a raw wallet address.
import { sdk } from "@netizen-labs/miniapp-sdk";
import type { MuenzenBalance, GrantRewardResult } from "@netizen-labs/miniapp-sdk";

/** The connected user's Röbel-Münzen balance, or null if unavailable (dev/host-less). */
export async function getMuenzenBalance(): Promise<MuenzenBalance | null> {
  try {
    return await sdk.roebel.getMuenzenBalance();
  } catch {
    return null;
  }
}

export type RewardOutcome =
  | { kind: "granted"; amount: number; remaining?: number }
  | { kind: "rejected" } // user declined the host confirm sheet
  | { kind: "budget" } // per-app budget exhausted / rate-limited (unreviewed = 0)
  | { kind: "error" };

/**
 * Reward a civic action (sharing the town, sending an invite). Fire-and-forget
 * from the UI's perspective: it resolves to a discriminated outcome and never
 * throws. `key` should be stable per action so retries stay idempotent.
 */
export async function grantCitizenReward(
  amount: number,
  reason: string,
  key: string,
): Promise<RewardOutcome> {
  try {
    const res: GrantRewardResult = await sdk.roebel.grantReward({
      amount,
      reason,
      idempotencyKey: key,
    });
    if (res.granted) {
      void sdk.haptics.notification("success").catch(() => {});
      return { kind: "granted", amount, remaining: res.remainingBudget };
    }
    return { kind: "budget" };
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code: unknown }).code)
        : undefined;
    if (code === "user_rejected") return { kind: "rejected" };
    if (code === "budget_exceeded" || code === "rate_limited") return { kind: "budget" };
    return { kind: "error" };
  }
}
