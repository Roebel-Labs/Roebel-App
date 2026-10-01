import { createPublicClient, http, parseAbi } from "viem";
import { gnosis } from "viem/chains";
import { ATTESTER_NFT, GOVERNOR, VOTE_OPTION } from "./constants";

export type ContractReader = {
  readContract: (args: { address: `0x${string}`; abi: readonly unknown[]; functionName: string; args?: readonly unknown[] }) => Promise<unknown>;
};

export interface ProposalOutcome {
  state: number;
  deadlineSec: number;
  tallyAddress: `0x${string}` | null;
  tallyPublished: boolean;
  forVotes: bigint;
  againstVotes: bigint;
  abstainVotes: bigint;
}

const governorAbi = parseAbi([
  "function state(uint256 proposalId) view returns (uint8)",
  "function proposalDeadline(uint256 proposalId) view returns (uint256)",
  "function proposalPolls(uint256 proposalId) view returns (uint256 pollId, address poll, address messageProcessor, address tally, uint256 deadline)",
]);
const tallyAbi = parseAbi([
  "function totalTallyResults() view returns (uint256)",
  "function tallyResults(uint256 index) view returns (uint256 value, bool isSet)",
]);
const attesterAbi = parseAbi([
  "function attesterCount() view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function hasAttesterNFT(address account) view returns (bool)",
]);

const ZERO = "0x0000000000000000000000000000000000000000";

export function gnosisReader(): ContractReader {
  // batch:false — publicnode/gnosischain RPCs have returned null for batched calls before.
  return createPublicClient({ chain: gnosis, transport: http(process.env.GNOSIS_RPC_URL ?? "https://rpc.gnosischain.com", { batch: false }) }) as unknown as ContractReader;
}

export async function readProposalOutcome(r: ContractReader, proposalId: bigint): Promise<ProposalOutcome> {
  const [state, deadline, polls] = await Promise.all([
    r.readContract({ address: GOVERNOR, abi: governorAbi, functionName: "state", args: [proposalId] }),
    r.readContract({ address: GOVERNOR, abi: governorAbi, functionName: "proposalDeadline", args: [proposalId] }),
    r.readContract({ address: GOVERNOR, abi: governorAbi, functionName: "proposalPolls", args: [proposalId] }),
  ]);
  const tally = (polls as readonly unknown[])[3] as `0x${string}`;
  const tallyAddress = tally && tally.toLowerCase() !== ZERO ? (tally.toLowerCase() as `0x${string}`) : null;
  const out: ProposalOutcome = {
    state: Number(state), deadlineSec: Number(deadline), tallyAddress, tallyPublished: false,
    forVotes: 0n, againstVotes: 0n, abstainVotes: 0n,
  };
  if (!tallyAddress) return out;
  const total = (await r.readContract({ address: tallyAddress, abi: tallyAbi, functionName: "totalTallyResults" })) as bigint;
  if (total === 0n) return out;
  const read = async (opt: bigint) =>
    ((await r.readContract({ address: tallyAddress, abi: tallyAbi, functionName: "tallyResults", args: [opt] })) as readonly [bigint, boolean])[0];
  const [f, a, ab] = await Promise.all([read(VOTE_OPTION.for), read(VOTE_OPTION.against), read(VOTE_OPTION.abstain)]);
  return { ...out, tallyPublished: true, forVotes: f, againstVotes: a, abstainVotes: ab };
}

export async function isAttester(r: ContractReader, wallet: string): Promise<boolean> {
  return Boolean(await r.readContract({ address: ATTESTER_NFT, abi: attesterAbi, functionName: "hasAttesterNFT", args: [wallet as `0x${string}`] }));
}

/** AttesterNFTv2 is soulbound and not enumerable: token ids are sequential, burned ids revert. */
export async function listAttesters(r: ContractReader, maxScan = 500): Promise<string[]> {
  const count = Number(await r.readContract({ address: ATTESTER_NFT, abi: attesterAbi, functionName: "attesterCount" }));
  const found = new Set<string>();
  for (let start = 0; start < maxScan && found.size < count; start += 20) {
    const ids = Array.from({ length: 20 }, (_, k) => BigInt(start + k));
    const owners = await Promise.all(ids.map((id) =>
      r.readContract({ address: ATTESTER_NFT, abi: attesterAbi, functionName: "ownerOf", args: [id] }).catch(() => null)));
    for (const o of owners) if (typeof o === "string") found.add(o.toLowerCase());
  }
  const holders = [...found];
  const still = await Promise.all(holders.map((w) => isAttester(r, w)));
  return holders.filter((_, i) => still[i]);
}
