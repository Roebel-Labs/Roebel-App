// manual_safe rail: never sends. An Attester records the hash of a transfer the Safe owners executed
// themselves; the server checks it on-chain before the line moves on.
import { createPublicClient, http, parseAbi, parseEventLogs } from "viem";
import { gnosis } from "viem/chains";
import { ATTESTER_SAFE, EURE } from "../constants";
import { toAtto } from "../money";

const transferAbi = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"]);

/**
 * True when one of the `transfers` (EURe Transfer events of the tx) moves exactly `amount` out of the
 * Attester Safe — and, when `to` is given, to `to`. Pure, so the matching rule is testable without RPC.
 */
export function hasSafeTransfer(
  transfers: Array<{ from: string; to: string; value: bigint }>, amount: string, to?: string | null,
): boolean {
  const want = toAtto(amount);
  const safe = ATTESTER_SAFE.toLowerCase();
  const recipient = to?.toLowerCase();
  return transfers.some((t) => t.from.toLowerCase() === safe && t.value === want && (!recipient || t.to.toLowerCase() === recipient));
}

/**
 * True when the tx succeeded, was mined at or after `notBeforeSec` (the payout line's creation, so an
 * older unrelated transfer cannot be claimed), and contains an EURe Transfer from the Attester Safe
 * for exactly `amount` — to `to` when given (task + fee lines; a budget line has no recipient wallet).
 */
export async function verifyManualSafeTransfer(
  txHash: string, amount: string, notBeforeSec: number, to?: string | null,
): Promise<boolean> {
  const pub = createPublicClient({ chain: gnosis, transport: http(process.env.GNOSIS_RPC_URL ?? "https://rpc.gnosischain.com", { batch: false }) });
  const r = await pub.getTransactionReceipt({ hash: txHash as `0x${string}` }).catch(() => null);
  if (!r || r.status !== "success") return false;
  const logs = parseEventLogs({ abi: transferAbi, logs: r.logs.filter((l) => l.address.toLowerCase() === EURE.toLowerCase()) });
  if (!hasSafeTransfer(logs.map((l) => l.args), amount, to)) return false;
  const block = await pub.getBlock({ blockNumber: r.blockNumber });
  return Number(block.timestamp) >= notBeforeSec;
}
