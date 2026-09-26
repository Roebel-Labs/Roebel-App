/**
 * Route-level behaviour of POST /api/passkey/sponsor.
 * Run: cd apps/web && npx tsx --test src/lib/passkey/__tests__/sponsor-route.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeFunctionData, parseAbi, recoverTypedDataAddress, type Hex } from "viem";
import { POST as routePOST } from "../../../app/api/passkey/sponsor/route";
import { ADDRESSES, LEGACY_ACCOUNT_PROXY_CODE, type ChainReader } from "../sponsor-policy";
import { handleSponsorRequest } from "../sponsor-handler";

// Anvil/Hardhat well-known test key #0 - publicly known, test-only.
const TEST_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const TEST_ADDR = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

const account = parseAbi([
  "function execute(address target, uint256 value, bytes calldata)",
]);
const safe4337 = parseAbi(["function executeUserOp(address to, uint256 value, bytes data, uint8 operation)"]);
const erc20 = parseAbi(["function transfer(address to, uint256 amount)"]);

const LEGACY = "0x1111111111111111111111111111111111111111" as Hex;
const SENDER = "0x2222222222222222222222222222222222222222" as Hex;

/** SENDER is admin of LEGACY, which carries the real thirdweb proxy code. */
const goodChain: ChainReader = {
  async getCode(a) {
    return a.toLowerCase() === LEGACY ? LEGACY_ACCOUNT_PROXY_CODE : undefined;
  },
  async isAdmin(account, signer) {
    return account.toLowerCase() === LEGACY && signer.toLowerCase() === SENDER;
  },
};
let chain: ChainReader = goodChain;
const POST = (r: Request) => handleSponsorRequest(r, { chain });

const goodCall = encodeFunctionData({
  abi: safe4337,
  functionName: "executeUserOp",
  args: [LEGACY, 0n, encodeFunctionData({ abi: account, functionName: "execute", args: [LEGACY, 1n, "0x"] }), 0],
});

function userOp(callData: Hex = goodCall) {
  return {
    sender: SENDER,
    nonce: "0x0",
    callData,
    callGasLimit: "0x493e0",
    verificationGasLimit: "0x7a120",
    preVerificationGas: "0xea60",
    maxFeePerGas: "0x77359400",
    maxPriorityFeePerGas: "0x3b9aca00",
    paymasterVerificationGasLimit: "0x186a0",
    paymasterPostOpGasLimit: "0x0",
  };
}

const req = (body: unknown) =>
  new Request("http://localhost/api/passkey/sponsor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

function enable(key: string | null = TEST_KEY) {
  process.env.PASSKEY_SPONSOR_ENABLED = "1";
  if (key === null) delete process.env.PASSKEY_SPONSOR_KEY;
  else process.env.PASSKEY_SPONSOR_KEY = key;
}

test("the real route handler (no chain) is 503 when disabled", async () => {
  delete process.env.PASSKEY_SPONSOR_ENABLED;
  const res = await routePOST(req({ chainId: 100, userOp: userOp() }));
  assert.equal(res.status, 503);
});

test("503 unless PASSKEY_SPONSOR_ENABLED === '1'", async () => {
  process.env.PASSKEY_SPONSOR_KEY = TEST_KEY;
  for (const v of [undefined, "", "true", "0"]) {
    if (v === undefined) delete process.env.PASSKEY_SPONSOR_ENABLED;
    else process.env.PASSKEY_SPONSOR_ENABLED = v;
    const res = await POST(req({ chainId: 100, userOp: userOp() }));
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: "disabled" });
  }
});

test("503 when enabled but the key is missing or malformed", async () => {
  enable(null);
  assert.equal((await POST(req({ chainId: 100, userOp: userOp() }))).status, 503);
  enable("0x1234");
  assert.equal((await POST(req({ chainId: 100, userOp: userOp() }))).status, 503);
});

test("400 on malformed JSON or malformed userOp", async () => {
  enable();
  assert.equal((await POST(req("{not json"))).status, 400);
  assert.equal((await POST(req({ chainId: 100, userOp: { sender: "x" } }))).status, 400);
  assert.equal((await POST(req({ chainId: 100 }))).status, 400);
});

test("403 on wrong chain", async () => {
  enable();
  const res = await POST(req({ chainId: 8453, userOp: userOp() }));
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, "not_sponsorable");
});

test("403 on a non-allowlisted callData", async () => {
  enable();
  const transfer = encodeFunctionData({
    abi: safe4337,
    functionName: "executeUserOp",
    args: [LEGACY, 0n, encodeFunctionData({ abi: erc20, functionName: "transfer", args: [LEGACY, 1n] }), 0],
  });
  const res = await POST(req({ chainId: 100, userOp: userOp(transfer) }));
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.error, "not_sponsorable");
  assert.equal(typeof body.reason, "string");
});

test("200 issues a voucher for the live paymaster, echoing gas limits verbatim", async () => {
  enable();
  const before = Math.floor(Date.now() / 1000);
  const res = await POST(req({ chainId: 100, userOp: userOp() }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.paymasterVerificationGasLimit, "0x186a0");
  assert.equal(body.paymasterPostOpGasLimit, "0x0");
  assert.ok(body.validUntil >= before + 600 && body.validUntil <= before + 602);
  const pad: string = body.paymasterAndData;
  assert.equal(pad.length, 2 + 372 * 2);
  assert.equal(pad.slice(0, 42), ADDRESSES.paymaster.toLowerCase());
  assert.equal(BigInt(`0x${pad.slice(42, 74)}`), 0x186a0n);
  assert.equal(BigInt(`0x${pad.slice(74, 106)}`), 0n);

  // Signature at paymasterData[224:289] recovers to the configured sponsor key.
  const pd = pad.slice(106);
  const word = (i: number) => `0x${pd.slice(i * 64, (i + 1) * 64)}` as Hex;
  const sig = `0x${pd.slice(224 * 2, 289 * 2)}` as Hex;
  const { hashStableFields } = await import("../voucher");
  const { parseSponsorUserOp, toPackedUserOperation } = await import("../sponsor-policy");
  const { voucherTypedData } = await import("../voucher");
  const voucher = {
    userOpHash: hashStableFields(toPackedUserOperation(parseSponsorUserOp(userOp()))),
    subjectHash: word(3),
    maxCostWei: BigInt(word(4)),
    validAfter: Number(BigInt(word(0))),
    validUntil: Number(BigInt(word(1))),
    nonce: word(2),
  };
  assert.equal(voucher.validUntil, body.validUntil);
  const recovered = await recoverTypedDataAddress({
    ...voucherTypedData(voucher, { chainId: 100, paymaster: ADDRESSES.paymaster }),
    signature: sig,
  });
  assert.equal(recovered, TEST_ADDR);
});

test("403 when the execute target is someone else's legacy account", async () => {
  enable();
  chain = { ...goodChain, isAdmin: async () => false };
  try {
    const res = await POST(req({ chainId: 100, userOp: userOp() }));
    assert.equal(res.status, 403);
    assert.match((await res.json()).reason, /not an admin/);
  } finally {
    chain = goodChain;
  }
});

test("RPC failure fails closed: 503 chain_unavailable, never a voucher", async () => {
  enable();
  chain = {
    async getCode() {
      throw new Error("rpc down");
    },
    async isAdmin() {
      throw new Error("rpc down");
    },
  };
  try {
    const res = await POST(req({ chainId: 100, userOp: userOp() }));
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.deepEqual(body, { error: "chain_unavailable" });
    assert.equal("paymasterAndData" in body, false);
  } finally {
    chain = goodChain;
  }
});
