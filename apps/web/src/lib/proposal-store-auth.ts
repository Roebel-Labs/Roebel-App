// Binds a stored proposal row to its on-chain proposer. Shared by the web form (builds + signs the
// message) and /api/proposals/store (verifies). No next/* or server-only imports: runs in the browser.
//
// The store route only writes a row when
//   (a) the tx `proposalId` (tx hash) emitted ProposalCreated on the governor with the claimed
//       numeric proposal id and proposer, and
//   (b) the proposer signed the exact content being stored.
import { decodeEventLog, parseAbi, sha256, stringToBytes } from "viem";
import { GOVERNOR } from "./vorhaben/constants";

export const STORE_MESSAGE_PREFIX = "roebel-proposal-store-v1";

export interface StorePayloadInput {
  title?: unknown;
  markdown?: unknown;
  category?: unknown;
  budgetAmount?: unknown;
  beneficiaryName?: unknown;
}

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const trimmed = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Canonical JSON (keys sorted) of exactly the fields the row is built from. */
export function canonicalStorePayload(i: StorePayloadInput): string {
  const c = {
    beneficiaryName: trimmed(i.beneficiaryName),
    budgetAmount: trimmed(i.budgetAmount),
    category: str(i.category),
    markdown: str(i.markdown),
    title: str(i.title),
  };
  return JSON.stringify(c, Object.keys(c).sort());
}

/** `roebel-proposal-store-v1:<numeric proposal id>:<sha256 of the canonical payload>` */
export function buildProposalStoreMessage(blockchainProposalId: string, i: StorePayloadInput): string {
  return `${STORE_MESSAGE_PREFIX}:${blockchainProposalId}:${sha256(stringToBytes(canonicalStorePayload(i)))}`;
}

// OpenZeppelin Governor ProposalCreated (MaciAttesterGovernor emits the stock event).
const proposalCreatedAbi = parseAbi([
  "event ProposalCreated(uint256 proposalId, address proposer, address[] targets, uint256[] values, string[] signatures, bytes[] calldatas, uint256 voteStart, uint256 voteEnd, string description)",
]);

type ReceiptLog = { address: string; topics: readonly `0x${string}`[] | `0x${string}`[]; data: `0x${string}` };
export interface StoreReceipt { status: "success" | "reverted"; blockNumber: bigint; logs: ReceiptLog[] }

export interface StoreAuthDeps {
  /** null when the RPC does not (yet) know the tx; throws when the RPC is unreachable. */
  getReceipt: (txHash: `0x${string}`) => Promise<StoreReceipt | null>;
  /** EOA / ERC-1271 / ERC-6492 check (verifyWalletSignature); throws when the verifier RPC is down. */
  verifySignature: (wallet: string, message: string, signature: string) => Promise<boolean>;
  governor?: string;
}

export type StoreAuthResult =
  | { ok: true; proposer: string; blockNumber: bigint; voteStart: bigint; voteEnd: bigint }
  | { ok: false; status: number; error: string };

const TX_RE = /^0x[0-9a-f]{64}$/i;
const WALLET_RE = /^0x[0-9a-f]{40}$/i;
const ID_RE = /^\d{1,80}$/;

/**
 * Canonical forms of the ids: decimal id without leading zeros, lowercase tx hash. Both client
 * (before signing) and server (before storing) use this so one on-chain proposal can never map to
 * two stored rows. Throws on malformed input.
 */
export function canonicalProposalIds(i: { blockchainProposalId: string; proposalId: string }): { blockchainProposalId: string; proposalId: string } {
  if (!ID_RE.test(i.blockchainProposalId)) throw new Error("Invalid blockchainProposalId");
  if (!TX_RE.test(i.proposalId)) throw new Error("Invalid proposalId (tx hash)");
  return { blockchainProposalId: BigInt(i.blockchainProposalId).toString(), proposalId: i.proposalId.toLowerCase() };
}

export async function authorizeProposalStore(
  deps: StoreAuthDeps,
  body: StorePayloadInput & { proposalId?: unknown; transactionHash?: unknown; blockchainProposalId?: unknown; proposerAddress?: unknown; signature?: unknown },
): Promise<StoreAuthResult> {
  const txHash = str(body.proposalId);
  const id = str(body.blockchainProposalId);
  const proposer = str(body.proposerAddress)?.toLowerCase() ?? null;
  const signature = str(body.signature);
  if (!txHash || !TX_RE.test(txHash)) return { ok: false, status: 400, error: "Invalid proposalId (tx hash)" };
  if (body.transactionHash !== undefined && (str(body.transactionHash) ?? "").toLowerCase() !== txHash.toLowerCase()) {
    return { ok: false, status: 400, error: "transactionHash must equal proposalId" };
  }
  if (!id || !ID_RE.test(id)) return { ok: false, status: 400, error: "Invalid blockchainProposalId" };
  const canon = canonicalProposalIds({ blockchainProposalId: id, proposalId: txHash });
  if (canon.blockchainProposalId !== id) return { ok: false, status: 400, error: "blockchainProposalId must be canonical (no leading zeros)" };
  if (canon.proposalId !== txHash) return { ok: false, status: 400, error: "proposalId must be a lowercase tx hash" };
  if (!proposer || !WALLET_RE.test(proposer)) return { ok: false, status: 400, error: "Invalid proposerAddress" };
  if (!signature || !/^0x[0-9a-f]+$/i.test(signature)) return { ok: false, status: 401, error: "Missing proposer signature" };

  let receipt: StoreReceipt | null;
  try {
    receipt = await deps.getReceipt(txHash.toLowerCase() as `0x${string}`);
  } catch {
    return { ok: false, status: 503, error: "Chain RPC unavailable, please retry" };
  }
  if (!receipt) return { ok: false, status: 503, error: "Transaction not found yet, please retry" };
  if (receipt.status !== "success") return { ok: false, status: 400, error: "Transaction reverted" };

  const governor = (deps.governor ?? GOVERNOR).toLowerCase();
  const want = BigInt(id);
  let event: { voteStart: bigint; voteEnd: bigint } | null = null;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== governor) continue;
    try {
      const d = decodeEventLog({ abi: proposalCreatedAbi, topics: log.topics as [`0x${string}`, ...`0x${string}`[]], data: log.data });
      if (d.eventName !== "ProposalCreated") continue;
      if (d.args.proposalId === want && d.args.proposer.toLowerCase() === proposer) {
        event = { voteStart: d.args.voteStart, voteEnd: d.args.voteEnd };
        break;
      }
    } catch { /* other governor event */ }
  }
  if (!event) return { ok: false, status: 400, error: "No matching ProposalCreated event for this proposer" };

  let valid: boolean;
  try {
    valid = await deps.verifySignature(proposer, buildProposalStoreMessage(id, body), signature);
  } catch {
    return { ok: false, status: 503, error: "Signature verifier unavailable, please retry" };
  }
  if (!valid) return { ok: false, status: 401, error: "Invalid proposer signature" };
  return { ok: true, proposer, blockNumber: receipt.blockNumber, ...event };
}
