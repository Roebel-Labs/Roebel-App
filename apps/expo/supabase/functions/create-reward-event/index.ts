// Edge Function: create-reward-event
// A citizen registers a 'Smart Event' (reward_events row). The returned id is encoded in the
// event QR. Gated to CitizenNFT holders — verify_jwt stays ON (anon key) AND the function
// re-checks hasCitizenNFT, so ONLY citizens can create reward-bearing events. CORS allows the
// apikey header so the mini-app's preflight succeeds from a normal browser. Service-role insert.
import { createPublicClient, http, getAddress } from "https://esm.sh/viem@2.21.0";
import { gnosis } from "https://esm.sh/viem@2.21.0/chains";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CITIZEN_NFT = "0x6FF3dC7974a990425DE79F4B21FB0a39F3B04DD4";
const citizenAbi = [{ type: "function", name: "hasCitizenNFT", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "bool" }] }] as const;
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { creator, label, expiresAt } = await req.json();
    const addr = getAddress(creator);
    const rpc = Deno.env.get("GNOSIS_RPC_URL") || "https://rpc.gnosischain.com";
    const pub = createPublicClient({ chain: gnosis, transport: http(rpc) });
    const isCitizen = await pub.readContract({ address: CITIZEN_NFT, abi: citizenAbi, functionName: "hasCitizenNFT", args: [addr] });
    if (!isCitizen) return json({ error: "only citizens can create events" }, 403);
    if (!label || typeof label !== "string") return json({ error: "label required" }, 400);
    const { data, error } = await db.from("reward_events").insert({
      label: label.slice(0, 80),
      expires_at: expiresAt ?? null,
      created_by: addr,
      active: true,
    }).select("id").single();
    if (error) return json({ error: error.message }, 500);
    return json({ id: data.id });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
function json(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } }); }
