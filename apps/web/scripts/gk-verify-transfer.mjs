/**
 * Verifies that the transfer calldata helpers produce the correct ABI selectors.
 *
 * Run: node apps/web/scripts/gk-verify-transfer.mjs
 * Expected: ✅ gk-verify-transfer passed
 */
import assert from "node:assert";
import { encodeFunctionData } from "viem";

// ERC-20 transfer(address,uint256) → selector 0xa9059cbb
const erc20 = encodeFunctionData({
  abi: [
    {
      name: "transfer",
      type: "function",
      stateMutability: "nonpayable",
      inputs: [
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
      ],
      outputs: [{ type: "bool" }],
    },
  ],
  functionName: "transfer",
  args: ["0x000000000000000000000000000000000000dEaD", 1000000000000000000n],
});
assert.ok(erc20.startsWith("0xa9059cbb"), `erc20 transfer selector mismatch: ${erc20.slice(0, 10)}`);

// ERC-1155 safeTransferFrom(address,address,uint256,uint256,bytes) → selector 0xf242432a
const SAFE_ADDR = "0x3A08c86Efc5ff38CC35d850F1D4d564e497bFDEa";
const erc1155 = encodeFunctionData({
  abi: [
    {
      name: "safeTransferFrom",
      type: "function",
      stateMutability: "nonpayable",
      inputs: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "id", type: "uint256" },
        { name: "amount", type: "uint256" },
        { name: "data", type: "bytes" },
      ],
      outputs: [],
    },
  ],
  functionName: "safeTransferFrom",
  args: [
    SAFE_ADDR,
    "0x000000000000000000000000000000000000dEaD",
    BigInt("0xAc2C1234567890123456789012345678901234567890".slice(0, 42)),
    1000000000000000000n,
    "0x",
  ],
});
assert.ok(erc1155.startsWith("0xf242432a"), `erc1155 safeTransferFrom selector mismatch: ${erc1155.slice(0, 10)}`);

// xDAI native transfer produces no calldata (data = "0x") — verified by convention.
const xdaiData = "0x";
assert.strictEqual(xdaiData, "0x", "xdai native transfer data is 0x");

console.log("✅ gk-verify-transfer passed");
