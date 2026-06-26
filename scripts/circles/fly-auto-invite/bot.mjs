// Röbel auto-invite worker (Fly).
// Trusts every CitizenNFTv2 holder the Röbel Münzen group doesn't trust yet, so each
// newly-verified citizen can receive (and mint) Röbel Münzen — no manual list.
// Signed by the group SERVICE key (= the burner 0xd502…, confirmed group.service()).
// This is the deploy copy of scripts/circles/auto-invite-bot.ts (env-only, no imports).
import { createPublicClient, createWalletClient, http, getAddress, parseAbiItem } from "viem";
import { gnosis } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const GROUP = getAddress("0xAc2CeCdBead594F97358a0d3132454f24F3E470c");
const HUB = getAddress("0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8");
const CITIZEN_NFT = getAddress("0x59aA26f499D7C2B3EC2c8524Ed06F54fc4E85dE5"); // CitizenNFTv2 (Gnosis)
const FAR_EXPIRY = 4102444800n; // ~year 2100 (uint96)
const FROM_BLOCK = BigInt(process.env.FROM_BLOCK ?? "46867000");
const WINDOW = 100_000n;
const BATCH = 30; // Circles convention: <=30 members per trust tx
const INTERVAL_MS = Number(process.env.INTERVAL_SECONDS ?? 600) * 1000;

const RPC = process.env.GNOSIS_RPC_URL || "https://rpc.gnosischain.com";
const RAW = process.env.SERVICE_PRIVKEY || process.env.SPIKE_PRIVKEY;
if (!RAW) {
  console.error("FATAL: set SERVICE_PRIVKEY (the group service / burner key)");
  process.exit(1);
}
const account = privateKeyToAccount(RAW.startsWith("0x") ? RAW : `0x${RAW}`);

const groupAbi = [{ type: "function", name: "trustBatchWithConditions", stateMutability: "nonpayable", inputs: [{ name: "_members", type: "address[]" }, { name: "_expiry", type: "uint96" }], outputs: [] }];
const hubAbi = [{ type: "function", name: "isTrusted", stateMutability: "view", inputs: [{ name: "t", type: "address" }, { name: "u", type: "address" }], outputs: [{ type: "bool" }] }];
const citizenAbi = [{ type: "function", name: "hasCitizenNFT", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "bool" }] }];

const ZERO = "0x0000000000000000000000000000000000000000";

async function runOnce() {
  const pub = createPublicClient({ chain: gnosis, transport: http(RPC) });
  const wallet = createWalletClient({ account, chain: gnosis, transport: http(RPC) });

  // 1) discover all CitizenNFT holders via mint events (Transfer from 0x0), chunked.
  const transfer = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)");
  const latest = await pub.getBlockNumber();
  const logs = [];
  for (let from = FROM_BLOCK; from <= latest; from += WINDOW) {
    const to = from + WINDOW - 1n > latest ? latest : from + WINDOW - 1n;
    for (let attempt = 0; ; attempt++) {
      try {
        const part = await pub.getLogs({ address: CITIZEN_NFT, event: transfer, args: { from: ZERO }, fromBlock: from, toBlock: to });
        logs.push(...part);
        break;
      } catch (e) {
        if (attempt >= 4) throw e;
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
  }
  const candidates = [...new Set(logs.map((l) => getAddress(l.args.to)))];

  // 2) keep current holders the group does NOT trust yet.
  const toTrust = [];
  for (const a of candidates) {
    const holds = await pub.readContract({ address: CITIZEN_NFT, abi: citizenAbi, functionName: "hasCitizenNFT", args: [a] }).catch(() => false);
    if (!holds) continue;
    const trusted = await pub.readContract({ address: HUB, abi: hubAbi, functionName: "isTrusted", args: [GROUP, a] }).catch(() => false);
    if (!trusted) toTrust.push(a);
  }
  // 3) pre-filter by the group's LIVE membership gate: simulate a single-member trust
  // per candidate, so a gated member (one not yet passing the condition) can never
  // revert the whole batch. API-agnostic — mirrors exactly what the real tx will do.
  const eligible = [];
  const skipped = [];
  for (const a of toTrust) {
    try {
      await pub.simulateContract({ address: GROUP, abi: groupAbi, functionName: "trustBatchWithConditions", args: [[a], FAR_EXPIRY], account: account.address });
      eligible.push(a);
    } catch {
      skipped.push(a);
    }
  }
  console.log(new Date().toISOString(), `citizens=${candidates.length} toTrust=${toTrust.length} eligible=${eligible.length} skipped=${skipped.length}`);
  if (skipped.length) console.log("  skipped (fail group membership gate):", skipped.map((a) => a.slice(0, 10)).join(", "));
  if (!eligible.length) return;

  // 4) trust the eligible members in batches (signed by the group service).
  for (let i = 0; i < eligible.length; i += BATCH) {
    const chunk = eligible.slice(i, i + BATCH);
    const hash = await wallet.writeContract({ address: GROUP, abi: groupAbi, functionName: "trustBatchWithConditions", args: [chunk, FAR_EXPIRY] });
    console.log(`  trusted ${chunk.length} -> tx ${hash}`);
    await pub.waitForTransactionReceipt({ hash });
  }
}

console.log("Röbel auto-invite worker up. Signing as", account.address, "| interval", INTERVAL_MS / 1000, "s");
(async function loop() {
  for (;;) {
    try {
      await runOnce();
    } catch (e) {
      console.error("run error:", e?.shortMessage ?? e?.message ?? e);
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
})();
