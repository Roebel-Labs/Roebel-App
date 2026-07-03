// Dynamic / auto-extending Röbel citizen list — read live from the on-chain
// CitizenNFTv2 + AttesterNFTv2 contracts on Gnosis. Every newly-verified citizen
// appears automatically here, with no manual code edit. On ANY RPC failure we fall
// back to the static ROEBEL_CITIZENS snapshot so the UI never crashes / goes empty.
//
// On-chain source of truth (Gnosis chainId 100):
//   CitizenNFTv2:  0x59aA26f499D7C2B3EC2c8524Ed06F54fc4E85dE5
//   AttesterNFTv2: 0xC587F383696D3c9DF7A6eE03A9160E40Ae1cdb82
// Both deployed ~Gnosis block 46867700 → that's the event-scan lower bound.
import { createPublicClient, http, getAddress, parseAbiItem, type Address } from "viem";
import { gnosis } from "viem/chains";
import { GNOSIS_RPC } from "./circles";
import { ROEBEL_CITIZENS, type Citizen } from "./citizens";

export const CITIZEN_NFT_V2 = "0x59aA26f499D7C2B3EC2c8524Ed06F54fc4E85dE5" as const;
export const ATTESTER_NFT_V2 = "0xC587F383696D3c9DF7A6eE03A9160E40Ae1cdb82" as const;

// Both NFTs were deployed in the same batch (the MACI core is at block 46867803).
// Scan from just below the deploy to be safe.
const DEPLOY_BLOCK = 46867700n;
// rpc.gnosischain.com rejects very large getLogs ranges and rate-limits (-32016);
// walk the range in fixed windows with light retry/backoff.
const CHUNK = 100_000n;

const publicClient = createPublicClient({ chain: gnosis, transport: http(GNOSIS_RPC) });

const CITIZEN_MINTED = parseAbiItem(
  "event CitizenNFTMinted(address indexed citizen, uint256 indexed tokenId, uint256 indexed requestId)",
);
const ATTESTER_MINTED = parseAbiItem(
  "event AttesterNFTMinted(address indexed attester, uint256 indexed tokenId, uint256 indexed requestId)",
);

const hasNftAbi = [
  { type: "function", name: "hasCitizenNFT", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "hasAttesterNFT", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "bool" }] },
] as const;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Enumerate every address that ever received `event` from `address`, chunking the
 * block range so a single oversized / rate-limited request can't fail the whole scan.
 * Returns a Set of LOWERCASED addresses (membership is re-checked via hasX afterwards).
 */
async function enumerateMintedTo(
  address: `0x${string}`,
  event: typeof CITIZEN_MINTED | typeof ATTESTER_MINTED,
  argName: "citizen" | "attester",
  latest: bigint,
): Promise<Set<string>> {
  const out = new Set<string>();
  for (let from = DEPLOY_BLOCK; from <= latest; from += CHUNK) {
    const to = from + CHUNK - 1n > latest ? latest : from + CHUNK - 1n;
    let attempt = 0;
    // Up to 3 tries per window with exponential backoff for transient RPC errors.
    for (;;) {
      try {
        const logs = await publicClient.getLogs({ address, event, fromBlock: from, toBlock: to });
        for (const log of logs) {
          const addr = (log.args as Record<string, unknown>)[argName] as string | undefined;
          if (addr) out.add(addr.toLowerCase());
        }
        break;
      } catch (err) {
        attempt++;
        if (attempt >= 3) throw err; // bubble up → caller falls back to the static list
        await sleep(300 * attempt);
      }
    }
    // Light pacing between windows to stay under the public RPC's rate limit.
    await sleep(60);
  }
  return out;
}

/** Re-check current holdership in parallel (handles revocations) with light pacing. */
async function filterCurrentHolders(
  contract: `0x${string}`,
  fn: "hasCitizenNFT" | "hasAttesterNFT",
  addrs: string[],
): Promise<Set<string>> {
  const kept = new Set<string>();
  const BATCH = 10;
  for (let i = 0; i < addrs.length; i += BATCH) {
    const slice = addrs.slice(i, i + BATCH);
    const results = await Promise.all(
      slice.map((a) =>
        publicClient
          .readContract({ address: contract, abi: hasNftAbi, functionName: fn, args: [a as Address] })
          .catch(() => false),
      ),
    );
    slice.forEach((a, idx) => { if (results[idx]) kept.add(a.toLowerCase()); });
    if (i + BATCH < addrs.length) await sleep(40);
  }
  return kept;
}

/**
 * Live Röbel citizen list from the on-chain CitizenNFTv2 contract (current holders
 * only, revocations excluded), with the 5 AttesterNFTv2 holders flagged.
 * Falls back to the static ROEBEL_CITIZENS snapshot on any RPC failure.
 */
export async function fetchRoebelCitizens(): Promise<Citizen[]> {
  try {
    const latest = await publicClient.getBlockNumber();

    // 1) Every address ever minted a Citizen / Attester NFT.
    const [mintedCitizens, mintedAttesters] = await Promise.all([
      enumerateMintedTo(CITIZEN_NFT_V2, CITIZEN_MINTED, "citizen", latest),
      enumerateMintedTo(ATTESTER_NFT_V2, ATTESTER_MINTED, "attester", latest),
    ]);

    // 2) Keep only those who CURRENTLY hold the NFT (drops any revoked).
    const [currentCitizens, currentAttesters] = await Promise.all([
      filterCurrentHolders(CITIZEN_NFT_V2, "hasCitizenNFT", [...mintedCitizens]),
      filterCurrentHolders(ATTESTER_NFT_V2, "hasAttesterNFT", [...mintedAttesters]),
    ]);

    if (currentCitizens.size === 0) return ROEBEL_CITIZENS; // empty result = treat as failure

    // 3) Build the de-duped Citizen[] (checksummed), flagging attesters.
    const seen = new Set<string>();
    const citizens: Citizen[] = [];
    for (const lower of currentCitizens) {
      if (seen.has(lower)) continue;
      seen.add(lower);
      citizens.push({ address: getAddress(lower) as `0x${string}`, attester: currentAttesters.has(lower) });
    }
    return citizens;
  } catch {
    // Any RPC failure (oversized range, rate-limit, network) → static fallback.
    return ROEBEL_CITIZENS;
  }
}
