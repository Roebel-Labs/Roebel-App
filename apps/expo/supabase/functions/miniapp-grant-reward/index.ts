// Edge Function: miniapp-grant-reward
// The Netizen Mini App reward payout rail. The web app (apps/web) already does all
// authorization BEFORE calling here — it validates the mini app is live, meters the
// per-app reward_budget, rate-limits, enforces idempotency, and writes a
// `mini_app_rewards` ledger row (status='pending'). This function performs the actual
// on-chain move: the funder hot wallet sends Röbel-Münzen (Circles v2 group ERC-1155)
// to the recipient on Gnosis, then marks the ledger row 'granted'.
//
// SECURITY: the transfer amount + recipient are taken from the ledger ROW (looked up by
// `ref`), NOT from the caller's body — so a caller cannot forge an amount or redirect
// funds. It only ever settles a pending, server-created row to that row's own recipient.
// Reuses the SAME funder as `claim-reward`.
//
// Required Supabase secrets (already set for claim-reward):
//   FUNDER_PRIVKEY  — funder hot wallet key (small Münzen float + xDAI gas)
//   GNOSIS_RPC_URL  — optional; defaults to rpc.gnosischain.com
// Auto-provided: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// GET  → { funder } (the funder's public address; safe to expose)
// POST { ref }      → { status, txHash?, funder }
import { createPublicClient, createWalletClient, http, getAddress } from "https://esm.sh/viem@2.21.0";
import { privateKeyToAccount } from "https://esm.sh/viem@2.21.0/accounts";
import { gnosis } from "https://esm.sh/viem@2.21.0/chains";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const HUB = "0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8";
const GROUP = "0xAc2CeCdBead594F97358a0d3132454f24F3E470c"; // Röbel-Münzen group token
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
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

function funderAccount() {
  const pk = Deno.env.get("FUNDER_PRIVKEY");
  if (!pk) return null;
  return privateKeyToAccount(pk.startsWith("0x") ? pk : `0x${pk}`);
}

/** whole/decimal Röbel-Münzen → 18-decimal atto (no float error). */
function toAtto(amount: number | string): bigint {
  const [w, f = ""] = String(amount).split(".");
  const frac = (f + "0".repeat(18)).slice(0, 18);
  return BigInt(w || "0") * 10n ** 18n + BigInt(frac || "0");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const account = funderAccount();

  // GET → surface the funder address (public info; no key exposure).
  if (req.method === "GET") {
    return json({ funder: account?.address ?? null, configured: !!account, group: GROUP });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let ref: string | undefined;
  try {
    ({ ref } = await req.json());
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (!ref) return json({ error: "missing ref" }, 400);

  // Load the ledger row — the source of truth for amount + recipient.
  const { data: row, error: rowErr } = await db
    .from("mini_app_rewards")
    .select("id, wallet, amount, status, tx_ref")
    .eq("id", ref)
    .single();
  if (rowErr || !row) return json({ status: "failed", reason: "reward row not found" }, 404);

  // Idempotent: already settled → return the existing tx.
  if (row.status === "granted" && row.tx_ref) {
    return json({ status: "granted", txHash: row.tx_ref, funder: account?.address ?? null });
  }
  if (row.status !== "pending") {
    return json({ status: row.status, reason: `row not pending (${row.status})` }, 409);
  }

  if (!account) {
    await db.from("mini_app_rewards").update({ status: "failed" }).eq("id", ref);
    return json({ status: "failed", reason: "funder not configured" }, 500);
  }

  let recipient: `0x${string}`;
  try {
    recipient = getAddress(row.wallet);
  } catch {
    await db.from("mini_app_rewards").update({ status: "failed" }).eq("id", ref);
    return json({ status: "failed", reason: "invalid recipient" }, 400);
  }

  const amountAtto = toAtto(row.amount);
  if (amountAtto <= 0n) {
    await db.from("mini_app_rewards").update({ status: "failed" }).eq("id", ref);
    return json({ status: "failed", reason: "non-positive amount" }, 400);
  }

  const rpc = Deno.env.get("GNOSIS_RPC_URL") || "https://rpc.gnosischain.com";
  const pub = createPublicClient({ chain: gnosis, transport: http(rpc) });

  const funderBal = (await pub.readContract({
    address: HUB, abi: hubAbi, functionName: "balanceOf", args: [account.address, GROUP_TOKEN_ID],
  })) as bigint;
  if (funderBal < amountAtto) {
    await db.from("mini_app_rewards").update({ status: "failed" }).eq("id", ref);
    return json({ status: "failed", reason: "insufficient funder float", funder: account.address }, 503);
  }

  try {
    const wallet = createWalletClient({ account, chain: gnosis, transport: http(rpc) });
    const hash = await wallet.writeContract({
      address: HUB, abi: hubAbi, functionName: "safeTransferFrom",
      args: [account.address, recipient, GROUP_TOKEN_ID, amountAtto, "0x"],
    });
    await db.from("mini_app_rewards").update({ status: "granted", tx_ref: hash }).eq("id", ref);
    return json({ status: "granted", txHash: hash, funder: account.address });
  } catch (e) {
    await db.from("mini_app_rewards").update({ status: "failed" }).eq("id", ref);
    return json({ status: "failed", reason: e instanceof Error ? e.message : String(e) }, 500);
  }
});
