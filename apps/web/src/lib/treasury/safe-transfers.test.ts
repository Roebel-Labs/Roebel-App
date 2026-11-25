import test from "node:test";
import assert from "node:assert/strict";
import { EURE_V2_ADDRESS, parseSafeTransfers } from "./flows";

const SAFE = "0x3A08c86Efc5ff38CC35d850F1D4d564e497bFDEa";
const row = (o: Record<string, unknown>) => ({ executionDate: "2026-10-06T07:32:25Z", transactionHash: "0xaa", ...o });

test("native in/out and EURe become flows; other tokens and unrelated rows are dropped", () => {
  const flows = parseSafeTransfers(SAFE, [
    row({ type: "ETHER_TRANSFER", from: SAFE, to: "0x1c11", value: "168880000000000000000" }),
    row({ type: "ETHER_TRANSFER", from: "0x1c11", to: SAFE.toLowerCase(), value: "5000000000000000000", transactionHash: "0xbb" }),
    row({ type: "ERC20_TRANSFER", from: "0x1c11", to: SAFE, value: "308000000000000000000", tokenAddress: "0xe91d", tokenInfo: { decimals: 18 } }),
    row({ type: "ERC20_TRANSFER", from: "0x1c11", to: SAFE, value: "2500000000000000000", tokenAddress: EURE_V2_ADDRESS, tokenInfo: { decimals: 18 }, transactionHash: "0xcc" }),
    row({ type: "ETHER_TRANSFER", from: "0x1", to: "0x2", value: "1" }),
  ]);
  assert.deepEqual(
    flows.map((f) => [f.kind, f.direction, f.amount, f.txHash]),
    [["xdai", "out", 168.88, "0xaa"], ["xdai", "in", 5, "0xbb"], ["eure", "in", 2.5, "0xcc"]],
  );
  assert.equal(flows[0].timestamp, Date.parse("2026-10-06T07:32:25Z"));
});
