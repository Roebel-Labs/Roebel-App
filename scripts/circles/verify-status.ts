// Read-only Circles verification diagnostic for a wallet on Gnosis.
// Tells you EXACTLY where a wallet stands toward being a verified Röbel-Taler member,
// and whether a given inviter (e.g. your Metri account) can currently invite it.
// No private key needed — pure reads. Same reads back the admin dashboard.
//
//   TRUSTEE=0x<thirdweb Gnosis address> pnpm exec tsx scripts/circles/verify-status.ts
//   (optional INVITER=0x1f14… defaults to the reference Metri account)
import { createPublicClient, http, getAddress, formatEther } from "viem";
import { gnosis } from "viem/chains";

const HUB = getAddress("0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8");
const CITIZEN_NFT = getAddress("0x6FF3dC7974a990425DE79F4B21FB0a39F3B04DD4");
const ROEBEL_GROUP = getAddress("0xAc2CeCdBead594F97358a0d3132454f24F3E470c");
const CIRCLES_RPC = "https://rpc.aboutcircles.com/";
const INVITATION_COST = 96n * 10n ** 18n;

const hubAbi = [
  { type: "function", name: "isHuman", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "isTrusted", stateMutability: "view", inputs: [{ name: "t", type: "address" }, { name: "u", type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }, { name: "id", type: "uint256" }], outputs: [{ type: "uint256" }] },
] as const;
const citizenAbi = [
  { type: "function", name: "hasCitizenNFT", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "bool" }] },
] as const;

async function trustersOf(addr: string): Promise<string[]> {
  try {
    const res = await fetch(CIRCLES_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "circles_query",
        params: [{
          Namespace: "V_Crc", Table: "TrustRelations", Columns: [],
          Filter: [{ Type: "Conjunction", ConjunctionType: "And", Predicates: [
            { Type: "FilterPredicate", FilterType: "Equals", Column: "version", Value: 2 },
            { Type: "FilterPredicate", FilterType: "Equals", Column: "trustee", Value: addr.toLowerCase() },
          ]}], Order: [],
        }],
      }),
    });
    const json = await res.json();
    const cols: string[] = json?.result?.columns ?? [];
    const rows: any[][] = json?.result?.rows ?? [];
    const ti = cols.indexOf("truster");
    return rows.map((r) => String(r[ti] ?? "")).filter(Boolean);
  } catch { return []; }
}

async function main() {
  const trusteeRaw = process.env.TRUSTEE ?? process.argv[2];
  if (!trusteeRaw) throw new Error("Set TRUSTEE=0x<thirdweb Gnosis address>");
  const trustee = getAddress(trusteeRaw);
  const inviter = getAddress(process.env.INVITER ?? "0x1f14c82926227d948b9a756db9aeb77fe51273c3");
  const rpc = process.env.GNOSIS_RPC_URL || "https://rpc.gnosischain.com";
  const pub = createPublicClient({ chain: gnosis, transport: http(rpc) });

  const read = (fn: string, args: any[], abi: any = hubAbi, address = HUB) =>
    pub.readContract({ address, abi, functionName: fn as any, args }) as Promise<any>;

  const [
    tHuman, tCitizen, tPersonal, tGroup, groupTrustsT, inviterTrustsT,
    iHuman, iPersonal,
  ] = await Promise.all([
    read("isHuman", [trustee]),
    read("hasCitizenNFT", [trustee], citizenAbi, CITIZEN_NFT),
    read("balanceOf", [trustee, BigInt(trustee)]),
    read("balanceOf", [trustee, BigInt(ROEBEL_GROUP)]),
    read("isTrusted", [ROEBEL_GROUP, trustee]),
    read("isTrusted", [inviter, trustee]),
    read("isHuman", [inviter]),
    read("balanceOf", [inviter, BigInt(inviter)]),
  ]);
  const trusters = await trustersOf(trustee);
  // Which trusters are registered humans (valid inviters), excluding the group + self.
  const humanTrusters: string[] = [];
  for (const t of trusters) {
    const a = t.toLowerCase();
    if (a === trustee.toLowerCase() || a === ROEBEL_GROUP.toLowerCase()) continue;
    try { if (await read("isHuman", [getAddress(t)])) humanTrusters.push(getAddress(t)); } catch {}
  }

  const f = (b: bigint) => Number(formatEther(b)).toFixed(2);
  console.log("\n=== THIRDWEB WALLET (trustee) ===");
  console.log("address           :", trustee);
  console.log("CitizenNFT        :", tCitizen ? "yes ✓" : "NO ✗");
  console.log("Circles human     :", tHuman ? "yes ✓ (already verified)" : "NO — not registered yet");
  console.log("personal CRC      :", f(tPersonal));
  console.log("Röbel-Taler (gCRC):", f(tGroup));
  console.log("trusted by group  :", groupTrustsT ? "yes (collateral-eligible)" : "no");
  console.log("human inviters     :", humanTrusters.length ? humanTrusters.join(", ") : "NONE — nobody human has invited it yet");

  console.log("\n=== INVITER (your Metri account) ===");
  console.log("address           :", inviter);
  console.log("Circles human     :", iHuman ? "yes ✓" : "NO ✗ (cannot invite)");
  console.log("personal CRC      :", f(iPersonal), iPersonal >= INVITATION_COST ? "✓ (>=96, can pay invite)" : "✗ (<96, invite would revert on register)");
  console.log("already trusts trustee:", inviterTrustsT ? "yes ✓ (invitation sent)" : "no");

  console.log("\n=== VERDICT ===");
  if (tHuman) {
    console.log("✅ DONE — the thirdweb wallet is already a verified Circles human.");
    console.log(tGroup > 0n ? "   It also holds Röbel-Taler." : "   Next: tap 'Heute abholen' in-app to mint Röbel-Taler.");
  } else if (humanTrusters.length > 0 || inviterTrustsT) {
    console.log("🟡 INVITED — a human already trusts it. Finish in-app:");
    console.log("   sign in as the thirdweb wallet → tap 'Bei Röbel-Taler mitmachen' (registerHuman).");
  } else if (iHuman && iPersonal >= INVITATION_COST) {
    console.log("🟠 READY TO INVITE — your inviter is a funded human, but has not trusted the wallet yet.");
    console.log("   It can invite, but a passkey wallet can't be scripted/WalletConnected — needs the");
    console.log("   mini-app or a passkey-Safe signing path. (A key-based funded inviter could use trust-wallet.ts.)");
  } else {
    console.log("🔴 BLOCKED — no human has invited the wallet, and the inviter can't pay/act:");
    if (!iHuman) console.log("   • inviter is not a registered Circles human");
    if (iPersonal < INVITATION_COST) console.log(`   • inviter has only ${f(iPersonal)} personal CRC (<96)`);
    console.log("   Options: InviteFarm community quota, the Metri mini-app, or a funded key-based inviter.");
  }
  console.log("");
}

main().catch((e) => { console.error("STATUS FAILED:", e?.shortMessage ?? e?.message ?? e); process.exit(1); });
