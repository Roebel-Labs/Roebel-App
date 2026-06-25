// Auto-invite bot (Task B): the "dynamic expanding" engine.
// Finds every CitizenNFT holder on Gnosis and trusts the ones the Röbel Münzen group
// doesn't trust yet — so each new verified citizen can mint Röbel Münzen WITHOUT a manual
// list. Trust is mirrored in the Hub; with the CitizenMembershipCondition applied (Task A)
// it's also enforced on-chain. Runs as the group's SERVICE (or owner): trustBatchWithConditions
// is onlyOwnerOrService, and group.service() = the burner 0xd502…74cf.
//
//   one pass:   SERVICE_PRIVKEY=0x<service key> pnpm exec tsx scripts/circles/auto-invite-bot.ts
//   continuous: wrap in cron / a Fly machine (e.g. every 5 min)
// Needs the service key + a little xDAI for gas. Falls back to SPIKE_PRIVKEY from .env.
import { createPublicClient, createWalletClient, http, getAddress, parseAbiItem } from "viem";
import { gnosis } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { loadEnv } from "./_env";

const GROUP = getAddress("0xAc2CeCdBead594F97358a0d3132454f24F3E470c");
const HUB = getAddress("0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8");
// CitizenNFTv2 (Sybil-hardened, 2026-06-25; supersedes v1 0x6FF3dC7974a990425DE79F4B21FB0a39F3B04DD4).
const CITIZEN_NFT = getAddress("0x59aA26f499D7C2B3EC2c8524Ed06F54fc4E85dE5");
const FAR_EXPIRY = 4102444800n; // ~year 2100 (uint96)
// Bound the log scan (v1 CitizenNFT deployed ~2026-06-17; CitizenNFTv2 ~2026-06-25, after
// this floor, so the default still catches v2 mints). Override via FROM_BLOCK.
const FROM_BLOCK = BigInt(process.env.FROM_BLOCK ?? "46700000");
const BATCH = 30; // Circles convention: ≤30 members per trust tx

const groupAbi = [
  { type: "function", name: "trustBatchWithConditions", stateMutability: "nonpayable", inputs: [{ name: "_members", type: "address[]" }, { name: "_expiry", type: "uint96" }], outputs: [] },
] as const;
const hubAbi = [
  { type: "function", name: "isTrusted", stateMutability: "view", inputs: [{ name: "t", type: "address" }, { name: "u", type: "address" }], outputs: [{ type: "bool" }] },
] as const;
const citizenAbi = [
  { type: "function", name: "hasCitizenNFT", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "bool" }] },
] as const;

async function main() {
  const { privKey, rpc } = loadEnv();
  const raw = process.env.SERVICE_PRIVKEY ?? privKey;
  const account = privateKeyToAccount((raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`);
  const pub = createPublicClient({ chain: gnosis, transport: http(rpc) });
  const wallet = createWalletClient({ account, chain: gnosis, transport: http(rpc) });
  console.log("Signing as (must be group owner or service):", account.address);

  // 1) Discover all CitizenNFT holders via mint events (Transfer from 0x0).
  const transfer = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)");
  const logs = await pub.getLogs({
    address: CITIZEN_NFT,
    event: transfer,
    args: { from: "0x0000000000000000000000000000000000000000" },
    fromBlock: FROM_BLOCK,
    toBlock: "latest",
  });
  const candidates = [...new Set(logs.map((l) => getAddress(l.args.to as `0x${string}`)))];
  console.log(`CitizenNFT mints found: ${candidates.length}`);

  // 2) Keep current holders the group does NOT trust yet.
  const toTrust: `0x${string}`[] = [];
  for (const a of candidates) {
    const holds = await pub.readContract({ address: CITIZEN_NFT, abi: citizenAbi, functionName: "hasCitizenNFT", args: [a] }).catch(() => false);
    if (!holds) continue;
    const trusted = await pub.readContract({ address: HUB, abi: hubAbi, functionName: "isTrusted", args: [GROUP, a] }).catch(() => false);
    if (!trusted) toTrust.push(a);
  }
  console.log(`citizens to trust: ${toTrust.length}`, toTrust);
  if (!toTrust.length) {
    console.log("nothing to do ✓");
    return;
  }

  // 3) Trust them in batches.
  for (let i = 0; i < toTrust.length; i += BATCH) {
    const chunk = toTrust.slice(i, i + BATCH);
    const hash = await wallet.writeContract({ address: GROUP, abi: groupAbi, functionName: "trustBatchWithConditions", args: [chunk, FAR_EXPIRY] });
    console.log(`trustBatchWithConditions (${chunk.length}) tx: ${hash}`);
    await pub.waitForTransactionReceipt({ hash });
  }
  console.log("done ✓ — new citizens can now mint Röbel Münzen (they still register in-app).");
}

main().catch((e) => {
  console.error("BOT FAILED:", e?.shortMessage ?? e?.message ?? e);
  process.exit(1);
});
