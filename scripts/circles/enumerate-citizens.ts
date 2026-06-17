// Read the authoritative citizen + attester holder sets from the LIVE Base
// production contracts (token IDs are sequential, so ownerOf(0..N) enumerates;
// burned/revoked IDs revert and are skipped). Also verifies the Gnosis Safe.
import { createPublicClient, http, getAddress } from "viem";
import { base, gnosis } from "viem/chains";

const CITIZEN_NFT = "0x7eF8308129C47E31415BEfC210aCEbD8ae6861BB";
const ATTESTER_NFT = "0x79B837b269f3EB3FB1c5856fE1E21675F05a3aFb";
const SAFE_GNOSIS = "0x3A08c86Efc5ff38CC35d850F1D4d564e497bFDEa";
const BASE_RPC = process.env.BASE_RPC_URL || "https://mainnet.base.org";
const GNOSIS_RPC = process.env.GNOSIS_RPC_URL || "https://rpc.gnosischain.com";

const ownerOfAbi = [{ type: "function", name: "ownerOf", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "address" }] }] as const;

async function holders(client: any, address: string, label: string): Promise<string[]> {
  const found: string[] = [];
  let misses = 0;
  for (let id = 0n; id < 100n && misses < 8; id++) {
    try {
      const owner = await client.readContract({ address, abi: ownerOfAbi, functionName: "ownerOf", args: [id] });
      found.push(getAddress(owner));
      misses = 0;
    } catch {
      misses++; // burned/revoked or past the end
    }
  }
  const unique = [...new Set(found)];
  console.log(`\n${label} (${unique.length} current holders):`);
  unique.forEach((a, i) => console.log(`  ${i + 1}. ${a}`));
  return unique;
}

async function main() {
  const baseClient = createPublicClient({ chain: base, transport: http(BASE_RPC) });
  const gnosisClient = createPublicClient({ chain: gnosis, transport: http(GNOSIS_RPC) });

  const citizens = await holders(baseClient, CITIZEN_NFT, "CITIZENS (Base CitizenNFT)");
  const attesters = await holders(baseClient, ATTESTER_NFT, "ATTESTERS (Base AttesterNFT)");

  const safeCode = await gnosisClient.getBytecode({ address: SAFE_GNOSIS as `0x${string}` });
  console.log(`\nGnosis Safe ${SAFE_GNOSIS}: ${safeCode && safeCode !== "0x" ? "✓ contract exists (" + (safeCode.length / 2 - 1) + " bytes)" : "✗ NO CODE — not a deployed contract!"}`);

  console.log("\n=== JSON (for the deploy script) ===");
  console.log(JSON.stringify({ citizens, attesters, safe: SAFE_GNOSIS }, null, 2));
}

main().catch((e) => { console.error("ENUMERATE FAILED:", e?.shortMessage ?? e?.message ?? e); process.exit(1); });
