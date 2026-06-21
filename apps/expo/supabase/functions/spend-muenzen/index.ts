// Edge Function: spend-muenzen
// The SINK side of the Röbel Münzen loop (Phase 2). The user pays the funder on-chain
// (ERC-1155 transfer of Röbel Münzen); this function verifies that payment tx and grants
// what was bought (currently: a lootbox key). Spend flows back to the funder → loop closed.
//
// Two modes:
//   quote : { wallet, kind, referenceId }            → { funder, priceAtto }
//   settle: { wallet, kind, referenceId, txHash }    → { status:'settled', keyCount }
//
// Idempotent: unique(tx_hash) in muenzen_charges means one payment tx grants exactly once.
// Required secret: FUNDER_PRIVKEY. Auto: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { createPublicClient, http, getAddress, parseEventLogs } from "https://esm.sh/viem@2.21.0";
import { privateKeyToAccount } from "https://esm.sh/viem@2.21.0/accounts";
import { gnosis } from "https://esm.sh/viem@2.21.0/chains";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const HUB = "0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8";
const GROUP = "0xAc2CeCdBead594F97358a0d3132454f24F3E470c";
const GROUP_TOKEN_ID = BigInt(GROUP);

const transferSingle = {
  type: "event", name: "TransferSingle", inputs: [
    { name: "operator", type: "address", indexed: true },
    { name: "from", type: "address", indexed: true },
    { name: "to", type: "address", indexed: true },
    { name: "id", type: "uint256", indexed: false },
    { name: "value", type: "uint256", indexed: false },
  ],
} as const;

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" };
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

function funderAccount() {
  const pk = Deno.env.get("FUNDER_PRIVKEY");
  if (!pk) return null;
  return privateKeyToAccount(pk.startsWith("0x") ? pk : `0x${pk}`);
}

/** Price (atto) of what `kind`/`referenceId` costs in Münzen. Currently only lootbox keys. */
async function priceOf(kind: string, referenceId: string): Promise<bigint | null> {
  if (kind === "lootbox_key") {
    const { data } = await db.from("lootboxes").select("muenzen_price_atto, is_published").eq("id", referenceId).maybeSingle();
    if (!data?.is_published || data.muenzen_price_atto == null) return null;
    return BigInt(data.muenzen_price_atto);
  }
  return null;
}

/** Grant what was bought after payment is verified. */
async function grant(kind: string, wallet: string, referenceId: string): Promise<unknown> {
  if (kind === "lootbox_key") {
    const { data, error } = await db.rpc("grant_lootbox_key", { p_wallet: wallet, p_lootbox_id: referenceId, p_count: 1 });
    if (error) throw new Error(error.message);
    return { keyCount: data };
  }
  throw new Error("unknown kind");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json();
    // Validate checksum, then store/compare lowercase so the granted key matches
    // how the rest of the app keys user_lootbox_keys (lowercase wallet_address).
    const wallet = getAddress(body.wallet).toLowerCase();
    const kind = String(body.kind ?? "");
    const referenceId = String(body.referenceId ?? "");
    const txHash = body.txHash ? String(body.txHash) : null;

    const account = funderAccount();
    if (!account) return json({ status: "failed", reason: "funder not configured" }, 500);
    const funder = account.address;

    const price = await priceOf(kind, referenceId);
    if (price == null) return json({ status: "rejected", reason: "not purchasable with Münzen" }, 400);

    // ── QUOTE ──
    if (!txHash) return json({ funder, priceAtto: price.toString() });

    // ── SETTLE ── reserve idempotently (unique tx_hash)
    const { data: charge, error: insErr } = await db.from("muenzen_charges")
      .insert({ wallet, kind, reference_id: referenceId, amount_atto: price.toString(), tx_hash: txHash, status: "pending" })
      .select("id").single();
    if (insErr) {
      if ((insErr as any).code === "23505") return json({ status: "already_settled" });
      return json({ status: "rejected", reason: "could not record charge" }, 500);
    }
    const chargeId = charge.id;

    // Verify the payment tx: sum Röbel-Münzen TransferSingle(s) wallet → funder ≥ price.
    const rpc = Deno.env.get("GNOSIS_RPC_URL") || "https://rpc.gnosischain.com";
    const pub = createPublicClient({ chain: gnosis, transport: http(rpc) });
    const receipt = await pub.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
    const hubLogs = receipt.logs.filter((l) => l.address.toLowerCase() === HUB.toLowerCase());
    const events = parseEventLogs({ abi: [transferSingle], logs: hubLogs, eventName: "TransferSingle" });
    let paid = 0n;
    for (const e of events as any[]) {
      const a = e.args;
      if (a.from.toLowerCase() === wallet.toLowerCase() && a.to.toLowerCase() === funder.toLowerCase() && a.id === GROUP_TOKEN_ID) {
        paid += a.value as bigint;
      }
    }
    if (paid < price) {
      await db.from("muenzen_charges").update({ status: "rejected", error: `paid ${paid} < ${price}` }).eq("id", chargeId);
      return json({ status: "rejected", reason: "payment not found / too low" }, 402);
    }

    const granted = await grant(kind, wallet, referenceId);
    await db.from("muenzen_charges").update({ status: "settled", settled_at: new Date().toISOString() }).eq("id", chargeId);
    await db.from("funder_ledger").insert({ direction: "charge", wallet, amount_atto: price.toString(), ref: referenceId, tx_hash: txHash });

    return json({ status: "settled", ...(granted as object) });
  } catch (e) {
    return json({ status: "failed", reason: String((e as Error)?.message ?? e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
