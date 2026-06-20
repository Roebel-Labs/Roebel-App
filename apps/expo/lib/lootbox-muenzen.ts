// Buy a Schatzkammer key with Röbel Münzen (Phase 2 — the sink side of the loop).
// Flow: quote the price + funder address → pay the funder on-chain (gasless) → settle, which
// verifies the payment and grants the key. The spend returns to the funder, closing the loop.
//
// NOTE: opening the chest still uses the existing key inventory (open_lootbox) — this only
// replaces buying the KEY with points. UI cutover happens once the funder float is seeded.
import { sendTransaction } from "thirdweb";
import type { Account } from "thirdweb/wallets";
import { supabase } from "@/lib/supabase";
import { prepareSendRoebelTaler, getRoebelTalerBalance } from "@/lib/roebel-taler";

export type BuyKeyResult =
  | { status: "settled"; keyCount: number }
  | { status: "already_settled" }
  | { status: "insufficient"; balanceAtto: string; priceAtto: string }
  | { status: "rejected"; reason?: string }
  | { status: "failed"; reason?: string };

/** Buy one key for `lootboxId`, paid in Röbel Münzen, charged to the funder. */
export async function buyLootboxKeyWithMuenzen(account: Account, lootboxId: string): Promise<BuyKeyResult> {
  try {
    // 1) Quote: price + where to pay.
    const q = await supabase.functions.invoke("spend-muenzen", {
      body: { wallet: account.address, kind: "lootbox_key", referenceId: lootboxId },
    });
    if (q.error) return { status: "failed", reason: q.error.message };
    const { funder, priceAtto } = q.data as { funder: string; priceAtto: string };
    const price = BigInt(priceAtto);

    // 2) Affordability (avoid a doomed tx).
    const balance = await getRoebelTalerBalance(account.address).catch(() => 0n);
    if (balance < price) return { status: "insufficient", balanceAtto: balance.toString(), priceAtto };

    // 3) Pay the funder (gasless via the smart account).
    const { transactionHash } = await sendTransaction({
      account,
      transaction: prepareSendRoebelTaler(account.address, funder, price),
    });

    // 4) Settle: verify the payment tx + grant the key (idempotent on txHash).
    const s = await supabase.functions.invoke("spend-muenzen", {
      body: { wallet: account.address, kind: "lootbox_key", referenceId: lootboxId, txHash: transactionHash },
    });
    if (s.error) return { status: "failed", reason: s.error.message };
    return s.data as BuyKeyResult;
  } catch (e: any) {
    return { status: "failed", reason: e?.message ?? String(e) };
  }
}
