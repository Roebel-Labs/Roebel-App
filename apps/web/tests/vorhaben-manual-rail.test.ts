import assert from "node:assert/strict";
import { test } from "node:test";
import { ATTESTER_SAFE, EURE } from "../src/lib/vorhaben/constants";
import { concatHex, encodeAbiParameters, encodeEventTopics, encodeFunctionData, encodePacked, parseAbi, parseAbiParameters, toEventSelector, type Hex } from "viem";
import {
  decodeMultiSendEntries, hasSafeTransfer, matchCardPayment, matchManualPayment, paymentsOfSafeTx, safePaymentsFromLogs,
} from "../src/lib/vorhaben/rails/manual";

const ASSIGNEE = "0x" + "2".repeat(40);
const PLATFORM = "0xbcabbaa26420e0a4771808f9639d4176355e5d4b";
const E = 10n ** 18n;
// One Safe batch tx: reward to the assignee + 5 % platform fee.
const batch = [
  { from: ATTESTER_SAFE, to: ASSIGNEE, value: 5n * E },
  { from: ATTESTER_SAFE, to: PLATFORM, value: E / 4n },
];

test("matches the exact amount from the Safe; without `to` any recipient counts (budget lines)", () => {
  assert.equal(hasSafeTransfer(batch, "5"), true);
  assert.equal(hasSafeTransfer(batch, "5", null), true);
  assert.equal(hasSafeTransfer(batch, "5.01"), false);
});

test("with `to`, the matching transfer must go to that recipient (case-insensitive)", () => {
  assert.equal(hasSafeTransfer(batch, "5", ASSIGNEE.toUpperCase().replace("0X", "0x")), true);
  assert.equal(hasSafeTransfer(batch, "0.25", PLATFORM), true);
  assert.equal(hasSafeTransfer(batch, "5", PLATFORM), false);
  assert.equal(hasSafeTransfer(batch, "0.25", ASSIGNEE), false);
});

test("a transfer from anyone but the Safe never matches", () => {
  assert.equal(hasSafeTransfer([{ from: ASSIGNEE, to: PLATFORM, value: 5n * E }], "5", PLATFORM), false);
});

// ---- native xDAI via the Safe's SafeMultiSigTransaction log + MultiSend ----------------------


const CARD = "0x1c11f068c83d364ad0a015c01d51d2cc6c62d1f9";
const MULTISEND_CALL_ONLY = "0x40A2aCCbd92BCA938b02010E17A5b8929b49130D";
const ZERO = "0x" + "0".repeat(40);
const sigEvent = parseAbi([
  "event SafeMultiSigTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures, bytes additionalInfo)",
]);
const transferEvent = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"]);

const safeTxLog = (to: string, value: bigint, data: Hex, operation: number, emitter: string = ATTESTER_SAFE) => ({
  address: emitter,
  topics: [toEventSelector(sigEvent[0])] as Hex[],
  data: encodeAbiParameters(
    parseAbiParameters("address, uint256, bytes, uint8, uint256, uint256, uint256, address, address, bytes, bytes"),
    [to as Hex, value, data, operation, 0n, 0n, 0n, ZERO as Hex, ZERO as Hex, "0x1234", "0x"]),
});
// Safe 1.3.0 L2: ExecutionSuccess(bytes32 txHash, uint256 payment), both unindexed.
const outcomeLog = (ok: boolean, emitter: string = ATTESTER_SAFE) => ({
  address: emitter,
  topics: [toEventSelector(ok ? "ExecutionSuccess(bytes32,uint256)" : "ExecutionFailure(bytes32,uint256)")] as Hex[],
  data: encodeAbiParameters(parseAbiParameters("bytes32, uint256"), [("0x" + "11".repeat(32)) as Hex, 0n]),
});
const eureTransferLog = (from: string, to: string, value: bigint) => ({
  address: EURE,
  topics: encodeEventTopics({ abi: transferEvent, eventName: "Transfer", args: { from: from as Hex, to: to as Hex } }) as Hex[],
  data: encodeAbiParameters(parseAbiParameters("uint256"), [value]),
});
const eureCall = (to: string, value: bigint) =>
  encodeFunctionData({ abi: parseAbi(["function transfer(address to, uint256 value)"]), args: [to as Hex, value] });
const packEntry = (op: number, to: string, value: bigint, data: Hex) =>
  encodePacked(["uint8", "address", "uint256", "uint256", "bytes"], [op, to as Hex, value, BigInt((data.length - 2) / 2), data]);
const multiSend = (...entries: Hex[]) =>
  encodeFunctionData({ abi: parseAbi(["function multiSend(bytes transactions)"]), args: [concatHex(entries)] });

test("native direct payout (relayed tx, 5 xDAI, data 0x, op 0) matches 5 € to the recipient as XDAI", () => {
  const logs = [safeTxLog(ASSIGNEE, 5n * E, "0x", 0), outcomeLog(true)];
  const payments = safePaymentsFromLogs(logs);
  assert.deepEqual(payments, [{ asset: "XDAI", to: ASSIGNEE, value: 5n * E }]);
  assert.deepEqual(matchManualPayment(payments, "5", ASSIGNEE), { asset: "XDAI", paidAmount: "5" });
  assert.deepEqual(matchManualPayment(payments, "5.00", ASSIGNEE.toUpperCase().replace("0X", "0x")), { asset: "XDAI", paidAmount: "5" });
});

test("wrong recipient or wrong amount never matches", () => {
  const payments = safePaymentsFromLogs([safeTxLog(ASSIGNEE, 5n * E, "0x", 0), outcomeLog(true)]);
  assert.equal(matchManualPayment(payments, "5", PLATFORM), null);
  assert.equal(matchManualPayment(payments, "5.01", ASSIGNEE), null);
  assert.equal(matchManualPayment(payments, "4.99", ASSIGNEE), null);
});

test("xDAI without a recipient (legacy budget line) is not accepted; EURe without a recipient still is", () => {
  const xdai = safePaymentsFromLogs([safeTxLog(CARD, 150n * E, "0x", 0), outcomeLog(true)]);
  assert.equal(matchManualPayment(xdai, "150", null), null);
  const eure = safePaymentsFromLogs([eureTransferLog(ATTESTER_SAFE, CARD, 150n * E)]);
  assert.deepEqual(matchManualPayment(eure, "150", null), { asset: "EURe", paidAmount: "150" });
});

test("a SafeMultiSigTransaction from another Safe, or one that ended in ExecutionFailure, is ignored", () => {
  const other = "0x" + "9".repeat(40);
  assert.deepEqual(safePaymentsFromLogs([safeTxLog(ASSIGNEE, 5n * E, "0x", 0, other), outcomeLog(true, other)]), []);
  assert.deepEqual(safePaymentsFromLogs([safeTxLog(ASSIGNEE, 5n * E, "0x", 0), outcomeLog(false)]), []);
  assert.deepEqual(safePaymentsFromLogs([safeTxLog(ASSIGNEE, 5n * E, "0x", 0)]), []);
  // A call with data (contract interaction) is not a native payout.
  assert.deepEqual(safePaymentsFromLogs([safeTxLog(ASSIGNEE, 5n * E, "0xdeadbeef", 0), outcomeLog(true)]), []);
});

test("MultiSend batch: native reward + EURe fee entries are decoded and matched", () => {
  const packed = [packEntry(0, ASSIGNEE, 5n * E, "0x"), packEntry(0, EURE, 0n, eureCall(PLATFORM, E / 4n))];
  const entries = decodeMultiSendEntries(concatHex(packed));
  assert.deepEqual(entries.map((e) => [e.operation, e.to, e.value]), [[0, ASSIGNEE, 5n * E], [0, EURE.toLowerCase(), 0n]]);
  const data = multiSend(...packed);
  const decoded = paymentsOfSafeTx({ to: MULTISEND_CALL_ONLY, value: 0n, data, operation: 1 });
  assert.deepEqual(decoded, [
    { asset: "XDAI", to: ASSIGNEE, value: 5n * E },
    { asset: "EURe", to: PLATFORM, value: E / 4n },
  ]);
  // In a receipt the EURe leg shows up as a Transfer log from the Safe; the native leg comes from the Safe log.
  const payments = safePaymentsFromLogs([
    safeTxLog(MULTISEND_CALL_ONLY, 0n, data, 1), eureTransferLog(ATTESTER_SAFE, PLATFORM, E / 4n), outcomeLog(true),
  ]);
  assert.deepEqual(matchManualPayment(payments, "5", ASSIGNEE), { asset: "XDAI", paidAmount: "5" });
  assert.deepEqual(matchManualPayment(payments, "0.25", PLATFORM), { asset: "EURe", paidAmount: "0.25" });
  assert.equal(matchManualPayment(payments, "0.25", ASSIGNEE), null);
});

test("MultiSend: a delegatecall to an unknown contract or nested delegatecall entries are never payments", () => {
  const data = multiSend(packEntry(0, ASSIGNEE, 5n * E, "0x"));
  assert.deepEqual(paymentsOfSafeTx({ to: "0x" + "7".repeat(40), value: 0n, data, operation: 1 }), []);
  const nested = multiSend(packEntry(1, ASSIGNEE, 5n * E, "0x"));
  assert.deepEqual(paymentsOfSafeTx({ to: MULTISEND_CALL_ONLY, value: 0n, data: nested, operation: 1 }), []);
  assert.deepEqual(paymentsOfSafeTx({ to: MULTISEND_CALL_ONLY, value: 0n, data: "0x8d80ff0a00", operation: 1 }), []);
});

test("card rule: the Safe sent AT LEAST the amount, to any recipient, in xDAI or EURe", () => {
  // Proposal #3: 150 € budget, card topped up with 168.88 xDAI from the Gemeinschaftskasse.
  const topUp = safePaymentsFromLogs([safeTxLog(CARD, 16888n * E / 100n, "0x", 0), outcomeLog(true)]);
  assert.deepEqual(matchCardPayment(topUp, "150"), { asset: "XDAI", paidAmount: "168.88" });
  assert.deepEqual(matchCardPayment(topUp, "168.88"), { asset: "XDAI", paidAmount: "168.88" });
  assert.equal(matchCardPayment(topUp, "168.89"), null);
  const eure = safePaymentsFromLogs([eureTransferLog(ATTESTER_SAFE, CARD, 200n * E)]);
  assert.deepEqual(matchCardPayment(eure, "150"), { asset: "EURe", paidAmount: "200" });
  // Only money leaving the Safe counts.
  assert.equal(matchCardPayment(safePaymentsFromLogs([eureTransferLog(CARD, ATTESTER_SAFE, 200n * E)]), "150"), null);
  assert.equal(matchCardPayment([], "150"), null);
});
