// manual_safe rail: never sends. An Attester records the hash of a payout the Safe owners executed
// themselves; the server checks it on-chain before the line moves on.
//
// The Gemeinschaftskasse (Attester Safe, a SafeL2) pays either in EURe (ERC-20 Transfer logs) or in
// native xDAI. Executions are relayed (tx.to is a relayer contract), so xDAI payouts are read from the
// Safe's own SafeMultiSigTransaction log in the receipt — a direct transfer (op 0, empty data) or a
// MultiSend batch (op 1 delegatecall into a canonical MultiSend contract). xDAI counts 1:1 as EUR.
import {
  createPublicClient, decodeAbiParameters, decodeEventLog, decodeFunctionData, http, parseAbi, parseAbiParameters,
  parseEventLogs, toEventSelector, type Hex,
} from "viem";
import { gnosis } from "viem/chains";
import { ATTESTER_SAFE, EURE } from "../constants";
import { fromAtto, toAtto } from "../money";

const transferAbi = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"]);
const safeTxAbi = parseAbi([
  "event SafeMultiSigTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures, bytes additionalInfo)",
]);
const multiSendAbi = parseAbi(["function multiSend(bytes transactions)"]);
// Selectors only: ExecutionSuccess/-Failure index txHash in Safe 1.4.x but not in 1.3.0 — topic0 is the same.
const EXECUTION_SUCCESS = toEventSelector("ExecutionSuccess(bytes32,uint256)");
const EXECUTION_FAILURE = toEventSelector("ExecutionFailure(bytes32,uint256)");
const ERC20_TRANSFER = "0xa9059cbb";

/** Canonical Safe MultiSend + MultiSendCallOnly deployments (1.3.0 incl. eip155 variants, 1.4.1), lowercase. */
export const MULTISEND_ADDRESSES: ReadonlySet<string> = new Set([
  "0xa238cbeb142c10ef7ad8442c6d1f9e89e07e7761", "0x40a2accbd92bca938b02010e17a5b8929b49130d",
  "0x998739bfdaadde7c933b942a68053933098f9eda", "0xa1dabef33b3b82c7814b6d82a79e50f4ac44102b",
  "0x38869bf66a61cf6bdb996a6ae40d5853fd43b526", "0x9641d764fc13c8b624c04430c7356c1c7c8102e2",
]);

export type PaidAsset = "EURe" | "XDAI";
/** One value transfer out of the Attester Safe found in a tx (18 decimals for both assets). */
export interface SafePayment { asset: PaidAsset; to: string; value: bigint }
/** What a recorded payout really moved: the matched transfer, as a decimal string. */
export interface PayoutMatch { asset: PaidAsset; paidAmount: string }

const lower = (s: string) => s.toLowerCase();

/**
 * True when one of the `transfers` (EURe Transfer events of the tx) moves exactly `amount` out of the
 * Attester Safe — and, when `to` is given, to `to`. Pure, so the matching rule is testable without RPC.
 */
export function hasSafeTransfer(
  transfers: Array<{ from: string; to: string; value: bigint }>, amount: string, to?: string | null,
): boolean {
  const want = toAtto(amount);
  const safe = lower(ATTESTER_SAFE);
  const recipient = to ? lower(to) : undefined;
  return transfers.some((t) => lower(t.from) === safe && t.value === want && (!recipient || lower(t.to) === recipient));
}

/** Packed MultiSend entries: uint8 operation, address to, uint256 value, uint256 dataLength, bytes data. */
export function decodeMultiSendEntries(packed: Hex): Array<{ operation: number; to: string; value: bigint; data: Hex }> {
  const hex = packed.slice(2);
  const out: Array<{ operation: number; to: string; value: bigint; data: Hex }> = [];
  let i = 0;
  while (i < hex.length) {
    if (hex.length - i < 2 * (1 + 20 + 32 + 32)) throw new Error("multiSend: truncated entry");
    const operation = parseInt(hex.slice(i, i + 2), 16); i += 2;
    const to = `0x${hex.slice(i, i + 40)}`; i += 40;
    const value = BigInt(`0x${hex.slice(i, i + 64)}`); i += 64;
    const len = Number(BigInt(`0x${hex.slice(i, i + 64)}`)); i += 64;
    if (hex.length - i < len * 2) throw new Error("multiSend: truncated data");
    out.push({ operation, to: lower(to), value, data: `0x${hex.slice(i, i + len * 2)}` as Hex });
    i += len * 2;
  }
  return out;
}

/** EURe or native xDAI payment carried by one call the Safe makes (op 0 only). */
function paymentOfCall(to: string, value: bigint, data: Hex): SafePayment | null {
  const d = lower(data);
  if (value > 0n && (d === "0x" || d === "")) return { asset: "XDAI", to: lower(to), value };
  if (value === 0n && lower(to) === lower(EURE) && d.startsWith(ERC20_TRANSFER) && d.length === 2 + 8 + 128) {
    const [recipient, amount] = decodeAbiParameters(parseAbiParameters("address, uint256"), `0x${d.slice(10)}` as Hex);
    return { asset: "EURe", to: lower(recipient), value: amount };
  }
  return null;
}

/** Payments of one executed Safe transaction (decoded SafeMultiSigTransaction args). */
export function paymentsOfSafeTx(tx: { to: string; value: bigint; data: Hex; operation: number }): SafePayment[] {
  if (tx.operation === 0) {
    const p = paymentOfCall(tx.to, tx.value, tx.data);
    return p ? [p] : [];
  }
  // A delegatecall moves the Safe's own funds only when it targets a known MultiSend contract.
  if (tx.operation !== 1 || !MULTISEND_ADDRESSES.has(lower(tx.to))) return [];
  let packed: Hex;
  try {
    const call = decodeFunctionData({ abi: multiSendAbi, data: tx.data });
    packed = call.args[0];
  } catch {
    return [];
  }
  let entries: ReturnType<typeof decodeMultiSendEntries>;
  try { entries = decodeMultiSendEntries(packed); } catch { return []; }
  // Nested delegatecalls are never counted: only plain calls are payments from the Safe.
  return entries.filter((e) => e.operation === 0)
    .map((e) => paymentOfCall(e.to, e.value, e.data))
    .filter((p): p is SafePayment => p !== null);
}

type RawLog = { address: string; topics: readonly Hex[] | Hex[]; data: Hex };

/**
 * Every payment out of the Attester Safe in one receipt: EURe Transfer logs from the Safe, plus the
 * xDAI/EURe calls of each Safe execution whose SafeMultiSigTransaction is followed by ExecutionSuccess.
 */
export function safePaymentsFromLogs(logs: RawLog[]): SafePayment[] {
  const safe = lower(ATTESTER_SAFE);
  const out: SafePayment[] = [];
  const eure = parseEventLogs({ abi: transferAbi, logs: logs.filter((l) => lower(l.address) === lower(EURE)) as never });
  for (const l of eure) {
    const a = l.args as { from: string; to: string; value: bigint };
    if (lower(a.from) === safe) out.push({ asset: "EURe", to: lower(a.to), value: a.value });
  }
  const safeLogs = logs.filter((l) => lower(l.address) === safe);
  const sigTopic = toEventSelector(safeTxAbi[0]);
  safeLogs.forEach((l, idx) => {
    if (l.topics[0] !== sigTopic) return;
    const outcome = safeLogs.slice(idx + 1).find((x) => x.topics[0] === EXECUTION_SUCCESS || x.topics[0] === EXECUTION_FAILURE);
    if (outcome?.topics[0] !== EXECUTION_SUCCESS) return;
    let args: { to: string; value: bigint; data: Hex; operation: number };
    try {
      args = decodeEventLog({ abi: safeTxAbi, topics: l.topics as [Hex, ...Hex[]], data: l.data }).args as typeof args;
    } catch {
      return;
    }
    // EURe moved by the execution is already in the Transfer logs above: only native xDAI is added here.
    out.push(...paymentsOfSafeTx(args).filter((p) => p.asset === "XDAI"));
  });
  return out;
}

/**
 * Exact match for a manual Safe payout: `amount` (xDAI wei == EURe atto, 1:1) to `to`. Without a
 * recipient (legacy budget lines) only an EURe transfer of exactly `amount` counts — xDAI without a
 * recipient is never accepted here (budget paid by card: see matchCardPayment).
 */
export function matchManualPayment(payments: SafePayment[], amount: string, to?: string | null): PayoutMatch | null {
  const want = toAtto(amount);
  const recipient = to ? lower(to) : null;
  const hit = payments.find((p) => p.value === want && (recipient ? p.to === recipient : p.asset === "EURe"));
  return hit ? { asset: hit.asset, paidAmount: fromAtto(hit.value) } : null;
}

/**
 * Card payment of a budget: the Safe topped up the operator's payment card with at least `amount`
 * (any recipient, xDAI or EURe) and the donation was paid with that card. The largest payment wins.
 */
export function matchCardPayment(payments: SafePayment[], amount: string): PayoutMatch | null {
  const want = toAtto(amount);
  const hit = payments.filter((p) => p.value >= want).sort((a, b) => (a.value < b.value ? 1 : a.value > b.value ? -1 : 0))[0];
  return hit ? { asset: hit.asset, paidAmount: fromAtto(hit.value) } : null;
}

/** One receipt + one block read: Safe payments of a successful tx mined at or after `notBeforeSec`. */
async function readSafePayments(txHash: string, notBeforeSec: number): Promise<SafePayment[] | null> {
  const pub = createPublicClient({ chain: gnosis, transport: http(process.env.GNOSIS_RPC_URL ?? "https://rpc.gnosischain.com", { batch: false }) });
  const r = await pub.getTransactionReceipt({ hash: txHash as Hex }).catch(() => null);
  if (!r || r.status !== "success") return null;
  const payments = safePaymentsFromLogs(r.logs);
  if (payments.length === 0) return null;
  // Mined at or after the line's creation, so an older unrelated transfer cannot be claimed.
  const block = await pub.getBlock({ blockNumber: r.blockNumber });
  return Number(block.timestamp) >= notBeforeSec ? payments : null;
}

/**
 * The tx succeeded, was mined at or after `notBeforeSec`, and the Safe sent exactly `amount` in EURe or
 * native xDAI — to `to` when given (task + fee lines; a legacy budget line without wallet: EURe only).
 */
export async function verifyManualSafeTransfer(
  txHash: string, amount: string, notBeforeSec: number, to?: string | null,
): Promise<PayoutMatch | null> {
  const payments = await readSafePayments(txHash, notBeforeSec);
  return payments ? matchManualPayment(payments, amount, to) : null;
}

/** Card top-up of a budget line: the Safe sent at least `amount` (xDAI or EURe, any recipient). */
export async function verifyCardTopUp(txHash: string, amount: string, notBeforeSec: number): Promise<PayoutMatch | null> {
  const payments = await readSafePayments(txHash, notBeforeSec);
  return payments ? matchCardPayment(payments, amount) : null;
}
