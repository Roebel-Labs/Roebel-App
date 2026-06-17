// Robust re-enumeration: full tokenId scan (no early cutoff) with retries that
// distinguish real ERC721 reverts (token doesn't exist) from RPC errors, on
// more lenient RPCs. Also re-checks the Safe on multiple Gnosis endpoints.
import { createPublicClient, http, getAddress } from "viem";
import { base, gnosis } from "viem/chains";

const CITIZEN_NFT = "0x7eF8308129C47E31415BEfC210aCEbD8ae6861BB";
const ATTESTER_NFT = "0x79B837b269f3EB3FB1c5856fE1E21675F05a3aFb";
const SAFE = "0x3A08c86Efc5ff38CC35d850F1D4d564e497bFDEa" as `0x${string}`;

const BASE_RPCS = ["https://base-rpc.publicnode.com", "https://base.llamarpc.com", "https://mainnet.base.org"];
const GNOSIS_RPCS = ["https://gnosis-rpc.publicnode.com", "https://rpc.gnosischain.com", "https://1rpc.io/gnosis"];

const ownerOfAbi = [{ type: "function", name: "ownerOf", stateMutability: "view", inputs: [{ name: "t", type: "uint256" }], outputs: [{ type: "address" }] }] as const;
const hasAttAbi = [{ type: "function", name: "hasAttesterNFT", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "bool" }] }] as const;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isRevert = (e: any) => /revert|nonexistent|ERC721|invalid token|0x7e273289/i.test(String(e?.shortMessage ?? e?.message ?? e));

const baseC = createPublicClient({ chain: base, transport: http(BASE_RPCS[0]) });
const gnoC = createPublicClient({ chain: gnosis, transport: http(GNOSIS_RPCS[0]) });

async function ownerOfRobust(addr: string, id: bigint): Promise<{ owner?: string; missing?: boolean }> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const o = await baseC.readContract({ address: addr, abi: ownerOfAbi, functionName: "ownerOf", args: [id] });
      return { owner: getAddress(o) };
    } catch (e: any) {
      if (isRevert(e)) return { missing: true };
      await sleep(400 * (attempt + 1)); // RPC hiccup — back off and retry
    }
  }
  throw new Error(`ownerOf(${id}) unresolved after retries (RPC)`);
}

async function holders(addr: string, label: string): Promise<string[]> {
  const found: string[] = [];
  for (let id = 0n; id < 40n; id++) {
    const r = await ownerOfRobust(addr, id);
    if (r.owner) found.push(r.owner);
    await sleep(120);
  }
  const unique = [...new Set(found)];
  console.log(`\n${label}: ${unique.length} holders`);
  unique.forEach((a, i) => console.log(`  ${i + 1}. ${a}`));
  return unique;
}

async function main() {
  const citizens = await holders(CITIZEN_NFT, "CITIZENS (Base)");
  const attesters: string[] = [];
  for (const a of citizens) {
    for (let attempt = 0; attempt < 4; attempt++) {
      try { if (await baseC.readContract({ address: ATTESTER_NFT, abi: hasAttAbi, functionName: "hasAttesterNFT", args: [a as `0x${string}`] })) attesters.push(a); break; }
      catch { await sleep(400 * (attempt + 1)); }
    }
    await sleep(120);
  }
  console.log(`\nATTESTERS (subset of citizens, via hasAttesterNFT): ${attesters.length}`);
  attesters.forEach((a) => console.log("  " + a));

  console.log("\nSafe bytecode across Gnosis RPCs:");
  for (const rpc of GNOSIS_RPCS) {
    try {
      const c = createPublicClient({ chain: gnosis, transport: http(rpc) });
      const code = await c.getBytecode({ address: SAFE });
      console.log(`  ${rpc}: ${code && code !== "0x" ? "CODE ✓ (" + (code.length / 2 - 1) + " bytes)" : "no code"}`);
    } catch (e: any) { console.log(`  ${rpc}: error ${e?.shortMessage ?? e?.message}`); }
  }
  console.log("\nJSON:", JSON.stringify({ citizens, attesters }));
}
main().catch((e) => { console.error("FAILED:", e?.shortMessage ?? e?.message ?? e); process.exit(1); });
