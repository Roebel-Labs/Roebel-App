// Edge Function: vorhaben-payout-send
// Sends one proposal payout line from the funder hot wallet (Röbel Münzen or xDAI on Gnosis).
// Called by the web app (cron + immediate dispatch) with the service-role key.
//
// SECURITY: amount, asset and recipient come from the payout line ROW, never from the body.
// claim_payout_line flips geplant → sendend atomically, so two callers can never both send.
//
// Secrets: FUNDER_PRIVKEY (shared with claim-reward), optional GNOSIS_RPC_URL.
// Auto: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { createPublicClient, createWalletClient, http, getAddress, encodeFunctionData, keccak256 } from "https://esm.sh/viem@2.21.0";
import { privateKeyToAccount } from "https://esm.sh/viem@2.21.0/accounts";
import { gnosis } from "https://esm.sh/viem@2.21.0/chains";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { toAtto } from "../_shared/payout-amount.ts";
import { assetMatchesRail, floatDecision } from "../_shared/funder-float.ts";

const HUB = "0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8";
const GROUP_TOKEN_ID = BigInt("0xAc2CeCdBead594F97358a0d3132454f24F3E470c");
const hubAbi = [
  { type: "function", name: "safeTransferFrom", stateMutability: "nonpayable", inputs: [
    { name: "from", type: "address" }, { name: "to", type: "address" },
    { name: "id", type: "uint256" }, { name: "value", type: "uint256" }, { name: "data", type: "bytes" },
  ], outputs: [] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [
    { name: "a", type: "address" }, { name: "id", type: "uint256" },
  ], outputs: [{ type: "uint256" }] },
] as const;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE_KEY, { auth: { persistSession: false } });

async function release(lineId: string, reason: string) {
  const { error } = await db.rpc("release_payout_line", { p_line_id: lineId, p_error: reason });
  if (error) console.error(`release_payout_line failed for ${lineId}: ${error.message}`);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (req.headers.get("authorization") !== `Bearer ${SERVICE_KEY}`) return json({ error: "unauthorized" }, 401);

  let lineId: string | undefined;
  try { ({ lineId } = await req.json()); } catch { return json({ error: "invalid_json" }, 400); }
  if (!lineId) return json({ error: "missing lineId" }, 400);

  const { data: claimed, error: claimErr } = await db.rpc("claim_payout_line", { p_line_id: lineId });
  if (claimErr) return json({ status: "failed", reason: claimErr.message }, 500);
  const line = (claimed as Array<Record<string, unknown>> | null)?.[0];
  if (!line) return json({ status: "skipped", reason: "line not geplant" });

  const rail = String(line.rail);
  if (rail !== "funder_muenzen" && rail !== "funder_xdai") {
    await release(lineId, `rail ${rail} is not a funder rail`);
    return json({ status: "failed", reason: "wrong rail" }, 400);
  }

  if (!assetMatchesRail(rail, String(line.asset))) {
    await release(lineId, "asset_rail_mismatch");
    return json({ status: "failed", reason: "asset_rail_mismatch" }, 400);
  }

  const pk = Deno.env.get("FUNDER_PRIVKEY");
  if (!pk) { await release(lineId, "funder_not_configured"); return json({ status: "failed", reason: "funder not configured" }, 500); }
  let account: ReturnType<typeof privateKeyToAccount>;
  try {
    account = privateKeyToAccount(pk.startsWith("0x") ? pk : `0x${pk}`);
  } catch (e) {
    await release(lineId, `rpc_error: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`);
    return json({ status: "failed", reason: "rpc_error" }, 503);
  }

  let recipient: `0x${string}`;
  let amountAtto: bigint;
  try {
    recipient = getAddress(String(line.recipient_wallet));
    amountAtto = toAtto(String(line.amount));
  } catch (e) {
    await release(lineId, `invalid line: ${e instanceof Error ? e.message : String(e)}`);
    return json({ status: "failed", reason: "invalid line" }, 400);
  }

  const rpc = Deno.env.get("GNOSIS_RPC_URL") || "https://rpc.gnosischain.com";
  const pub = createPublicClient({ chain: gnosis, transport: http(rpc) });
  let muenzenBal: bigint;
  let xdaiBal: bigint;
  try {
    [muenzenBal, xdaiBal] = await Promise.all([
      pub.readContract({ address: HUB, abi: hubAbi, functionName: "balanceOf", args: [account.address, GROUP_TOKEN_ID] }) as Promise<bigint>,
      pub.getBalance({ address: account.address }),
    ]);
  } catch (e) {
    await release(lineId, `rpc_error: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`);
    return json({ status: "failed", reason: "rpc_error" }, 503);
  }
  if (floatDecision(rail, amountAtto, muenzenBal, xdaiBal) === "float_low") {
    await release(lineId, "float_low");
    return json({ status: "float_low" });
  }

  // Sign-persist-broadcast: the hash is known and stored BEFORE anything is broadcast,
  // so an uncertain broadcast can never be released and re-sent (no double payment).
  const wallet = createWalletClient({ account, chain: gnosis, transport: http(rpc) });
  let serialized: `0x${string}`;
  let hash: `0x${string}`;
  try {
    const request = await wallet.prepareTransactionRequest(
      rail === "funder_muenzen"
        ? {
            account, chain: gnosis, to: HUB, value: 0n,
            data: encodeFunctionData({ abi: hubAbi, functionName: "safeTransferFrom",
              args: [account.address, recipient, GROUP_TOKEN_ID, amountAtto, "0x"] }),
          }
        : { account, chain: gnosis, to: recipient, value: amountAtto },
    );
    serialized = await account.signTransaction(request as never);
    hash = keccak256(serialized);
  } catch (e) {
    // Nothing was broadcast yet → safe to put back.
    await release(lineId, `sign failed: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`);
    return json({ status: "failed", reason: "sign failed" }, 502);
  }

  // Persist the hash (status stays 'sendend') before broadcasting.
  const { error: persistErr } = await db.from("proposal_payout_lines")
    .update({ tx_hash: hash, updated_at: new Date().toISOString() }).eq("id", lineId);
  if (persistErr) {
    await release(lineId, `persist failed: ${persistErr.message.slice(0, 200)}`);
    return json({ status: "failed", reason: "persist failed" }, 500);
  }

  try {
    await pub.sendRawTransaction({ serializedTransaction: serialized });
  } catch (e) {
    // The node may have accepted the tx despite the error. NEVER release here.
    const msg = e instanceof Error ? e.message.slice(0, 200) : String(e);
    const { error: unklarErr } = await db.from("proposal_payout_lines")
      .update({ status: "unklar", error: `broadcast_uncertain: ${msg}`, updated_at: new Date().toISOString() }).eq("id", lineId);
    if (unklarErr) console.error(`payout ${lineId} unklar update failed (tx ${hash}): ${unklarErr.message}`);
    return json({ status: "unklar", txHash: hash });
  }

  const { error: sentErr } = await db.from("proposal_payout_lines")
    .update({ status: "gesendet", updated_at: new Date().toISOString() }).eq("id", lineId);
  if (sentErr) console.error(`payout ${lineId} gesendet update failed, tx ${hash} already broadcast: ${sentErr.message}`);

  if (rail === "funder_muenzen") {
    const { error: ledgerErr } = await db.from("funder_ledger").insert({
      direction: "payout", wallet: recipient, amount_atto: amountAtto.toString(), ref: `vorhaben:${lineId}`, tx_hash: hash,
    });
    if (ledgerErr) console.error(`funder_ledger insert failed for ${lineId} (tx ${hash}): ${ledgerErr.message}`);
  }

  // The web side (settleIfMined) confirms; this function never settles a line.
  return json({ status: "gesendet", txHash: hash });
});
    const status = receipt.status === "success" ? "bestaetigt" : "fehlgeschlagen";
    await db.from("proposal_payout_lines").update({ status, error: status === "fehlgeschlagen" ? "reverted" : null, updated_at: new Date().toISOString() }).eq("id", lineId);
    return json({ status, txHash: hash });
  } catch {
    // Receipt not seen yet; the web cron confirms gesendet lines later.
    return json({ status: "gesendet", txHash: hash });
  }
});
