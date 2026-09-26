/**
 * Route-level behaviour of POST /api/passkey/sponsor.
 * Run: cd apps/web && npx tsx --test src/lib/passkey/__tests__/sponsor-route.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeFunctionData, parseAbi, recoverTypedDataAddress, type Hex } from "viem";
import { POST as routePOST } from "../../../app/api/passkey/sponsor/route";
import { parseSponsorUserOp, toPackedUserOperation, type ChainReader } from "../sponsor-policy";
import { PRODUCTION_SPONSOR_SIGNERS, handleSponsorRequest } from "../sponsor-handler";
import type { SponsorBudget } from "../sponsor-budget";
import { hashStableFields, requiredPrefund, voucherTypedData } from "../voucher";
import { safeFactoryData, PASSKEY_SAFE } from "../safe-address";
import { GOOD_SIG, KEY, LEGACY, SAFE, brokenChain, fakeChain } from "./fake-chain";

// Anvil/Hardhat well-known test key #0 - publicly known, test-only.
const TEST_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const TEST_ADDR = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const NOT_AN_ADDRESS = "0x00000000000000000000000000000000000Pa1";
/** Stands in for the dedicated PREVIEW paymaster (never the production 0x11ed…). */
const PAYMASTER = "0x1234567890AbcdEF1234567890aBcdef12345678" as Hex;

const account = parseAbi([
  "struct SignerPermissionRequest { address signer; uint8 isAdmin; address[] approvedTargets; uint256 nativeTokenLimitPerTransaction; uint128 permissionStartTimestamp; uint128 permissionEndTimestamp; uint128 reqValidityStartTimestamp; uint128 reqValidityEndTimestamp; bytes32 uid; }",
  "function setPermissionsForSigner(SignerPermissionRequest req, bytes signature)",
  "function execute(address target, uint256 value, bytes calldata)",
]);
const safe4337 = parseAbi(["function executeUserOp(address to, uint256 value, bytes data, uint8 operation)"]);
const erc20 = parseAbi(["function transfer(address to, uint256 amount)"]);

class RecordingBudget implements SponsorBudget {
  calls: Array<{ key: string; cost: bigint }> = [];
  constructor(private allow = true) {}
  async reserve(key: string, cost: bigint) {
    this.calls.push({ key, cost });
    return this.allow;
  }
}

let chain: ChainReader = fakeChain();
let budget = new RecordingBudget();
const POST = (r: Request) => handleSponsorRequest(r, { chain, budget });

const executeCall = encodeFunctionData({
  abi: safe4337,
  functionName: "executeUserOp",
  args: [LEGACY, 0n, encodeFunctionData({ abi: account, functionName: "execute", args: [LEGACY, 1n, "0x"] }), 0],
});

function handoverCall(): Hex {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const perm = encodeFunctionData({
    abi: account,
    functionName: "setPermissionsForSigner",
    args: [
      {
        signer: SAFE,
        isAdmin: 1,
        approvedTargets: [],
        nativeTokenLimitPerTransaction: 0n,
        permissionStartTimestamp: 0n,
        permissionEndTimestamp: 0n,
        reqValidityStartTimestamp: now - 60n,
        reqValidityEndTimestamp: now + 3600n,
        uid: `0x${"02".repeat(32)}`,
      },
      GOOD_SIG,
    ],
  });
  return encodeFunctionData({ abi: safe4337, functionName: "executeUserOp", args: [LEGACY, 0n, perm, 0] });
}

function userOp(callData: Hex = executeCall, extra: Record<string, string> = {}) {
  return {
    sender: SAFE,
    nonce: "0x0",
    callData,
    callGasLimit: "0x493e0",
    verificationGasLimit: "0x7a120",
    preVerificationGas: "0xea60",
    maxFeePerGas: "0x77359400",
    maxPriorityFeePerGas: "0x3b9aca00",
    paymasterVerificationGasLimit: "0x249f0",
    paymasterPostOpGasLimit: "0xc350",
    ...extra,
  };
}
const body = (uo: object = userOp(), over: object = {}) => ({ chainId: 100, userOp: uo, x: KEY.x, y: KEY.y, legacy: LEGACY, ...over });

const req = (b: unknown) =>
  new Request("http://localhost/api/passkey/sponsor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof b === "string" ? b : JSON.stringify(b),
  });

function enable(key: string | null = TEST_KEY, paymaster: string | null = PAYMASTER) {
  process.env.PASSKEY_SPONSOR_ENABLED = "1";
  if (key === null) delete process.env.PASSKEY_SPONSOR_KEY;
  else process.env.PASSKEY_SPONSOR_KEY = key;
  if (paymaster === null) delete process.env.PASSKEY_PAYMASTER_ADDRESS;
  else process.env.PASSKEY_PAYMASTER_ADDRESS = paymaster;
  chain = fakeChain();
  budget = new RecordingBudget();
}

async function captureErrors<T>(fn: () => Promise<T>): Promise<{ result: T; logs: string[] }> {
  const logs: string[] = [];
  const orig = console.error;
  console.error = (...args: unknown[]) => logs.push(args.map(String).join(" "));
  try {
    return { result: await fn(), logs };
  } finally {
    console.error = orig;
  }
}

test("the real route handler (no chain) is 503 when disabled", async () => {
  delete process.env.PASSKEY_SPONSOR_ENABLED;
  const res = await routePOST(req(body()));
  assert.equal(res.status, 503);
});

test("503 unless PASSKEY_SPONSOR_ENABLED === '1'", async () => {
  enable();
  for (const v of [undefined, "", "true", "0"]) {
    if (v === undefined) delete process.env.PASSKEY_SPONSOR_ENABLED;
    else process.env.PASSKEY_SPONSOR_ENABLED = v;
    const res = await POST(req(body()));
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: "disabled" });
  }
});

test("503 when enabled but the key is missing or malformed", async () => {
  await captureErrors(async () => {
    enable(null);
    assert.equal((await POST(req(body()))).status, 503);
    enable("0x1234");
    assert.equal((await POST(req(body()))).status, 503);
  });
});

test("503 when PASSKEY_PAYMASTER_ADDRESS is missing or malformed (no default paymaster)", async () => {
  await captureErrors(async () => {
    enable(TEST_KEY, null);
    assert.equal((await POST(req(body()))).status, 503);
    enable(TEST_KEY, "0x11ed");
    assert.equal((await POST(req(body()))).status, 503);
    enable(TEST_KEY, NOT_AN_ADDRESS);
    assert.equal((await POST(req(body()))).status, 503);
  });
});

test("the production Netizen sponsor signer is refused as the preview key", () => {
  assert.ok(PRODUCTION_SPONSOR_SIGNERS.map((a) => a.toLowerCase()).includes("0x218b0a592f2078aa542d7b981638595df6ba8bf7"));
});

test("400 on malformed JSON, malformed userOp, or missing x / y / legacy", async () => {
  enable();
  assert.equal((await POST(req("{not json"))).status, 400);
  assert.equal((await POST(req(body({ sender: "x" })))).status, 400);
  assert.equal((await POST(req({ chainId: 100 }))).status, 400);
  assert.equal((await POST(req(body(userOp(), { x: undefined })))).status, 400);
  assert.equal((await POST(req(body(userOp(), { y: "0x12" })))).status, 400);
  assert.equal((await POST(req(body(userOp(), { legacy: undefined })))).status, 400);
});

test("403 on wrong chain", async () => {
  enable();
  const res = await POST(req(body(userOp(), { chainId: 8453 })));
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, "not_sponsorable");
});

test("403 on a non-allowlisted callData, budget untouched", async () => {
  enable();
  const transfer = encodeFunctionData({
    abi: safe4337,
    functionName: "executeUserOp",
    args: [LEGACY, 0n, encodeFunctionData({ abi: erc20, functionName: "transfer", args: [LEGACY, 1n] }), 0],
  });
  const res = await POST(req(body(userOp(transfer))));
  assert.equal(res.status, 403);
  const b = await res.json();
  assert.equal(b.error, "not_sponsorable");
  assert.equal(typeof b.reason, "string");
  assert.equal(budget.calls.length, 0);
});

test("403 on 50 gwei maxFeePerGas", async () => {
  enable();
  const res = await POST(req(body(userOp(executeCall, { maxFeePerGas: "0xba43b7400" }))));
  assert.equal(res.status, 403);
  assert.match((await res.json()).reason, /maxFeePerGas/);
});

test("200: voucher for the CONFIGURED paymaster, gas limits echoed, budget reserved per legacy", async () => {
  enable();
  const before = Math.floor(Date.now() / 1000);
  const res = await POST(req(body()));
  assert.equal(res.status, 200);
  const b = await res.json();
  assert.equal(b.paymasterVerificationGasLimit, "0x249f0");
  assert.equal(b.paymasterPostOpGasLimit, "0xc350");
  assert.ok(b.validUntil >= before + 600 && b.validUntil <= before + 602);
  const pad: string = b.paymasterAndData;
  assert.equal(pad.length, 2 + 372 * 2);
  assert.equal(pad.slice(0, 42), PAYMASTER.toLowerCase());

  const packed = toPackedUserOperation(parseSponsorUserOp(userOp()));
  assert.deepEqual(budget.calls, [{ key: LEGACY.toLowerCase(), cost: requiredPrefund(packed) }]);

  const pd = pad.slice(106);
  const word = (i: number) => `0x${pd.slice(i * 64, (i + 1) * 64)}` as Hex;
  const sig = `0x${pd.slice(224 * 2, 289 * 2)}` as Hex;
  const voucher = {
    userOpHash: hashStableFields(packed),
    subjectHash: word(3),
    maxCostWei: BigInt(word(4)),
    validAfter: Number(BigInt(word(0))),
    validUntil: Number(BigInt(word(1))),
    nonce: word(2),
  };
  assert.equal(voucher.maxCostWei, requiredPrefund(packed));
  const recovered = await recoverTypedDataAddress({
    ...voucherTypedData(voucher, { chainId: 100, paymaster: PAYMASTER }),
    signature: sig,
  });
  assert.equal(recovered, TEST_ADDR);
});

test("200: deploy + handover through the route", async () => {
  enable();
  chain = fakeChain((w) => {
    w.codes.delete(SAFE.toLowerCase());
    w.admins.delete(`${LEGACY}:${SAFE}`.toLowerCase());
  });
  const uo = userOp(handoverCall(), { factory: PASSKEY_SAFE.proxyFactory, factoryData: safeFactoryData(KEY) });
  const res = await POST(req(body(uo)));
  assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
});

test("429 budget_exhausted when the reservation fails, never a voucher", async () => {
  enable();
  budget = new RecordingBudget(false);
  const res = await POST(req(body()));
  assert.equal(res.status, 429);
  assert.deepEqual(await res.json(), { error: "budget_exhausted" });
});

test("403 when the sender is not an admin of the named legacy account", async () => {
  enable();
  chain = fakeChain((w) => w.admins.delete(`${LEGACY}:${SAFE}`.toLowerCase()));
  const res = await POST(req(body()));
  assert.equal(res.status, 403);
  assert.match((await res.json()).reason, /not an admin/);
  assert.equal(budget.calls.length, 0);
});

test("RPC failure fails closed: 503 chain_unavailable, and the log never carries the RPC URL", async () => {
  enable();
  chain = brokenChain();
  const { result: res, logs } = await captureErrors(() => POST(req(body())));
  assert.equal(res.status, 503);
  const b = await res.json();
  assert.deepEqual(b, { error: "chain_unavailable" });
  assert.equal(logs.length, 1);
  assert.doesNotMatch(logs.join("\n"), /apikey|rpc\.example|SECRET|rpc down/);
  assert.equal(budget.calls.length, 0);
});

test("a throwing budget fails closed with 503", async () => {
  enable();
  budget = {
    calls: [],
    async reserve() {
      throw new Error("db down postgres://user:pw@host");
    },
  } as unknown as RecordingBudget;
  const { result: res, logs } = await captureErrors(() => POST(req(body())));
  assert.equal(res.status, 503);
  assert.doesNotMatch(logs.join("\n"), /postgres|pw@/);
});
