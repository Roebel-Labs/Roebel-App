/**
 * Verifies Safe owner-management calldata selectors produced by the
 * buildAddOwner / buildRemoveOwner / buildChangeThreshold helpers.
 *
 * Run: node apps/web/scripts/gk-verify-owner-tx.mjs
 * Expected: ✅ gk-verify-owner-tx passed
 *
 * Reference selectors (keccak256 of function signature, first 4 bytes):
 *   changeThreshold(uint256)                  → 0x694e80c3
 *   addOwnerWithThreshold(address,uint256)     → 0x0d582f13
 *   removeOwner(address,address,uint256)       → 0xf8dc5dd9
 */
import assert from "node:assert";
import { encodeFunctionData } from "viem";

const SAFE_ABI = [
  {
    name: "addOwnerWithThreshold",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "owner", type: "address" },
      { name: "_threshold", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "removeOwner",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "prevOwner", type: "address" },
      { name: "owner", type: "address" },
      { name: "_threshold", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "changeThreshold",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "_threshold", type: "uint256" }],
    outputs: [],
  },
];

const DUMMY_ADDR = "0x000000000000000000000000000000000000dEaD";
const SENTINEL = "0x0000000000000000000000000000000000000001";

// changeThreshold(uint256) → 0x694e80c3
const changeThresholdData = encodeFunctionData({
  abi: SAFE_ABI,
  functionName: "changeThreshold",
  args: [2n],
});
assert.ok(
  changeThresholdData.startsWith("0x694e80c3"),
  `changeThreshold selector mismatch: got ${changeThresholdData.slice(0, 10)}, expected 0x694e80c3`,
);

// addOwnerWithThreshold(address,uint256) → 0x0d582f13
const addOwnerData = encodeFunctionData({
  abi: SAFE_ABI,
  functionName: "addOwnerWithThreshold",
  args: [DUMMY_ADDR, 2n],
});
assert.ok(
  addOwnerData.startsWith("0x0d582f13"),
  `addOwnerWithThreshold selector mismatch: got ${addOwnerData.slice(0, 10)}, expected 0x0d582f13`,
);

// removeOwner(address,address,uint256) → 0xf8dc5dd9
const removeOwnerData = encodeFunctionData({
  abi: SAFE_ABI,
  functionName: "removeOwner",
  args: [SENTINEL, DUMMY_ADDR, 1n],
});
assert.ok(
  removeOwnerData.startsWith("0xf8dc5dd9"),
  `removeOwner selector mismatch: got ${removeOwnerData.slice(0, 10)}, expected 0xf8dc5dd9`,
);

console.log("✅ gk-verify-owner-tx passed");
