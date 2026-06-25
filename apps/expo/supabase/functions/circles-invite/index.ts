// Edge Function: circles-invite
// The Röbel operator (a registered Circles human, server-held key) TRUSTS a verified
// citizen on Gnosis — the Circles "invitation". The app then calls registerHuman(operator)
// so the citizen becomes a Röbel Münzen member. The operator key never leaves the server.
//
// Required Supabase secrets:
//   OPERATOR_PRIVKEY  — the operator human's private key (holds CRC for WELCOME_BONUS/invite)
//   GNOSIS_RPC_URL    — a reliable Gnosis RPC
//
// Deploy via Supabase MCP (deploy_edge_function). Verify gate: CitizenNFT on Gnosis.
import { createPublicClient, createWalletClient, http, getAddress } from "https://esm.sh/viem@2.21.0";
import { privateKeyToAccount } from "https://esm.sh/viem@2.21.0/accounts";
import { gnosis } from "https://esm.sh/viem@2.21.0/chains";

const HUB = "0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8";
const CITIZEN_NFT = "0x59aA26f499D7C2B3EC2c8524Ed06F54fc4E85dE5"; // Gnosis CitizenNFTv2 (Sybil-hardened, 2026-06-25; superset of the old 0x6FF3… set)
const FAR_EXPIRY = 4102444800n; // year 2100 (uint96)

const hubAbi = [
  { type: "function", name: "trust", stateMutability: "nonpayable", inputs: [{ name: "_trustReceiver", type: "address" }, { name: "_expiry", type: "uint96" }], outputs: [] },
  { type: "function", name: "isHuman", stateMutability: "view", inputs: [{ name: "_h", type: "address" }], outputs: [{ type: "bool" }] },
] as const;
const citizenAbi = [
  { type: "function", name: "hasCitizenNFT", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "bool" }] },
] as const;

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { gnosisAddress } = await req.json();
    const citizen = getAddress(gnosisAddress);

    const rpc = Deno.env.get("GNOSIS_RPC_URL") || "https://rpc.gnosischain.com";
    const pk = Deno.env.get("OPERATOR_PRIVKEY");
    if (!pk) return json({ error: "operator not configured" }, 500);

    const pub = createPublicClient({ chain: gnosis, transport: http(rpc) });

    // Gate: only verified citizens (Gnosis CitizenNFT) may be invited.
    const isCitizen = await pub.readContract({ address: CITIZEN_NFT, abi: citizenAbi, functionName: "hasCitizenNFT", args: [citizen] });
    if (!isCitizen) return json({ error: "not a verified citizen" }, 403);

    // Idempotent: if already a registered human, nothing to do.
    const already = await pub.readContract({ address: HUB, abi: hubAbi, functionName: "isHuman", args: [citizen] });
    if (already) return json({ ok: true, alreadyRegistered: true });

    const account = privateKeyToAccount(pk.startsWith("0x") ? pk : `0x${pk}`);
    const wallet = createWalletClient({ account, chain: gnosis, transport: http(rpc) });
    const hash = await wallet.writeContract({ address: HUB, abi: hubAbi, functionName: "trust", args: [citizen, FAR_EXPIRY] });
    await pub.waitForTransactionReceipt({ hash });

    return json({ ok: true, inviter: account.address, txHash: hash });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
