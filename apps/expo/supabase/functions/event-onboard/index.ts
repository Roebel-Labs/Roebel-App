// Edge Function: event-onboard
// A first-time scanner of a Smart Event QR gets the OPERATOR to trust them (the Circles
// invite), so they can registerHuman(operator) from the app and start minting their own
// personal 'Münzen'. Operator-funded (the ~96 CRC burns from the operator on register).
// Gated to a valid, active reward_events id so the operator only pays for real attendees.
import { createPublicClient, createWalletClient, http, getAddress } from "https://esm.sh/viem@2.21.0";
import { privateKeyToAccount } from "https://esm.sh/viem@2.21.0/accounts";
import { gnosis } from "https://esm.sh/viem@2.21.0/chains";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const HUB = "0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8";
const FAR_EXPIRY = 4102444800n;
const hubAbi = [
  { type: "function", name: "trust", stateMutability: "nonpayable", inputs: [{ name: "_t", type: "address" }, { name: "_e", type: "uint96" }], outputs: [] },
  { type: "function", name: "isHuman", stateMutability: "view", inputs: [{ name: "_h", type: "address" }], outputs: [{ type: "bool" }] },
] as const;
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" };
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { wallet, eventId } = await req.json();
    const addr = getAddress(wallet);
    // Gate: the event must exist + be active + in-window (so the operator only pays for real attendees).
    const { data: ev } = await db.from("reward_events").select("active, starts_at, expires_at").eq("id", eventId).maybeSingle();
    if (!ev || !ev.active) return json({ error: "event not active" }, 403);
    const now = Date.now();
    if (ev.starts_at && now < Date.parse(ev.starts_at)) return json({ error: "event not started" }, 403);
    if (ev.expires_at && now > Date.parse(ev.expires_at)) return json({ error: "event ended" }, 403);

    const pk = Deno.env.get("OPERATOR_PRIVKEY");
    if (!pk) return json({ error: "operator not configured" }, 500);
    const rpc = Deno.env.get("GNOSIS_RPC_URL") || "https://rpc.gnosischain.com";
    const pub = createPublicClient({ chain: gnosis, transport: http(rpc) });
    const already = await pub.readContract({ address: HUB, abi: hubAbi, functionName: "isHuman", args: [addr] });
    const account = privateKeyToAccount(pk.startsWith("0x") ? pk : `0x${pk}`);
    if (already) return json({ ok: true, alreadyRegistered: true, inviter: account.address });
    const w = createWalletClient({ account, chain: gnosis, transport: http(rpc) });
    const hash = await w.writeContract({ address: HUB, abi: hubAbi, functionName: "trust", args: [addr, FAR_EXPIRY] });
    await pub.waitForTransactionReceipt({ hash });
    return json({ ok: true, inviter: account.address, txHash: hash });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
function json(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } }); }
