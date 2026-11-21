/**
 * Settle path (security review M-2): POST /api/passkey/sponsor/settle + the lazy sweep.
 * Every acceptance path has a deny beside it: the amount always comes from the chain event,
 * never from the request; foreign paymasters and unknown hashes change nothing.
 * Run: cd apps/web && npx tsx --test src/lib/passkey/__tests__/sponsor-settle.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { numberToHex, type Hex } from "viem";
import { InMemorySponsorBudget, reservationIdOf } from "../sponsor-budget";
import {
  SWEEP_GRACE_SEC,
  handleSponsorSettle,
  sweepExpiredReservations,
  type UserOpEvent,
  type UserOpEventReader,
} from "../sponsor-settle";
import { handleSponsorRequest } from "../sponsor-handler";
import { SESSION_NONCE_KEY, permissionIdsOf, personalMintData, sessionClaimCallData } from "../session-keys-builders";
import { KEY, LEGACY, SAFE, fakeChain, migrateTo7579 } from "./fake-chain";
import { DEVICE_SIGNER, deviceAuthFor } from "./device-auth";

const TEST_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const PAYMASTER = "0x1234567890AbcdEF1234567890aBcdef12345678" as Hex;
const OTHER_PM = "0x9999999999999999999999999999999999999999" as Hex;
const HASH = `0x${"ab".repeat(32)}` as Hex;
const SKEY = `session:${SAFE.toLowerCase()}`;
const NONCE = SESSION_NONCE_KEY << 64n;

function enable() {
  process.env.PASSKEY_SPONSOR_ENABLED = "1";
  process.env.PASSKEY_SPONSOR_KEY = TEST_KEY;
  process.env.PASSKEY_PAYMASTER_ADDRESS = PAYMASTER;
  delete process.env.PASSKEY_SPONSOR_SESSION_DAILY_WEI;
}

const ev = (over: Partial<UserOpEvent> = {}): UserOpEvent => ({
  userOpHash: HASH,
  sender: SAFE,
  paymaster: PAYMASTER,
  nonce: NONCE,
  success: true,
  actualGasCost: 100n,
  ...over,
});

/** Fake chain events; records the filters it was asked for. Ignores the filter like a sloppy RPC would. */
function events(list: UserOpEvent[] | (() => never)): UserOpEventReader & { filters: unknown[] } {
  const filters: unknown[] = [];
  return {
    filters,
    async userOperationEvents(f) {
      filters.push(f);
      if (typeof list === "function") return list();
      return list;
    },
  };
}

const settleReq = (b: unknown) =>
  new Request("http://localhost/api/passkey/sponsor/settle", { method: "POST", body: JSON.stringify(b) });

async function reserved(budget: InMemorySponsorBudget, cost: bigint, nonce = NONCE, expiresAt = 1_000) {
  assert.ok(await budget.reserve(SKEY, cost, { keyCapWei: 10_000n, reservation: { id: reservationIdOf(SAFE, nonce), sender: SAFE, nonce, expiresAt } }));
}

test("settle: the event's actualGasCost settles the (sender, nonce) reservation; the request names only the hash", async () => {
  enable();
  const budget = new InMemorySponsorBudget({ globalDailyWei: 10_000n, now: () => 0 });
  await reserved(budget, 10_000n);
  const chain = events([ev({ actualGasCost: 2_500n })]);
  const res = await handleSponsorSettle(settleReq({ chainId: 100, userOpHash: HASH, actualGasCost: "1" }), { budget, events: chain, nowSeconds: () => 0 });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).status, "settled");
  assert.deepEqual(chain.filters[0], { paymaster: PAYMASTER, userOpHash: HASH, sinceSeconds: 86_400 });
  // 2_500 charged (not the client's "1", not the 10_000 reserved): 7_500 free again.
  assert.equal(await budget.reserve(SKEY, 7_500n, { keyCapWei: 10_000n }), true);
  assert.equal(await budget.reserve(SKEY, 1n, { keyCapWei: 10_000n }), false);
  // a second settle is a no-op
  const again = await handleSponsorSettle(settleReq({ chainId: 100, userOpHash: HASH }), { budget, events: chain, nowSeconds: () => 0 });
  assert.equal((await again.json()).status, "already_settled");
});

test("settle deny: an event of another paymaster or another hash settles nothing (404)", async () => {
  enable();
  const budget = new InMemorySponsorBudget({ globalDailyWei: 10_000n, now: () => 0 });
  await reserved(budget, 10_000n);
  for (const e of [ev({ paymaster: OTHER_PM, actualGasCost: 0n }), ev({ userOpHash: `0x${"cd".repeat(32)}`, actualGasCost: 0n })]) {
    const res = await handleSponsorSettle(settleReq({ chainId: 100, userOpHash: HASH }), { budget, events: events([e]), nowSeconds: () => 0 });
    assert.equal(res.status, 404);
  }
  assert.equal(await budget.reserve(SKEY, 1n, { keyCapWei: 10_000n }), false, "still fully reserved");
});

test("settle deny: an event for a reservation the store does not know = status unknown, nothing changes", async () => {
  enable();
  const budget = new InMemorySponsorBudget({ globalDailyWei: 10_000n, now: () => 0 });
  await reserved(budget, 10_000n);
  const res = await handleSponsorSettle(settleReq({ chainId: 100, userOpHash: HASH }), {
    budget,
    events: events([ev({ nonce: NONCE + 7n, actualGasCost: 0n })]),
    nowSeconds: () => 0,
  });
  assert.equal((await res.json()).status, "unknown");
  assert.equal(await budget.reserve(SKEY, 1n, { keyCapWei: 10_000n }), false);
});

test("settle: bad requests 400, disabled 503, chain failure 503 (nothing changes)", async () => {
  enable();
  const budget = new InMemorySponsorBudget({ now: () => 0 });
  for (const b of [{ chainId: 1, userOpHash: HASH }, { chainId: 100 }, { chainId: 100, userOpHash: "0x12" }, null]) {
    assert.equal((await handleSponsorSettle(settleReq(b), { budget, events: events([]) })).status, 400);
  }
  assert.equal((await handleSponsorSettle(new Request("http://x", { method: "POST", body: "{" }), { budget, events: events([]) })).status, 400);
  const boom = events(() => {
    throw new Error("rpc down");
  });
  const orig = console.error;
  console.error = () => {};
  try {
    assert.equal((await handleSponsorSettle(settleReq({ chainId: 100, userOpHash: HASH }), { budget, events: boom })).status, 503);
  } finally {
    console.error = orig;
  }
  process.env.PASSKEY_SPONSOR_ENABLED = "0";
  assert.equal((await handleSponsorSettle(settleReq({ chainId: 100, userOpHash: HASH }), { budget, events: events([]) })).status, 503);
  enable();
  assert.equal((await handleSponsorSettle(settleReq({ chainId: 100, userOpHash: HASH }), { budget: { reserve: async () => true }, events: events([]) })).status, 503);
});

test("sweep: an expired reservation that landed is settled from chain; one that never landed is released", async () => {
  const budget = new InMemorySponsorBudget({ globalDailyWei: 10_000n, now: () => 0 });
  await reserved(budget, 4_000n, NONCE, 100);
  await reserved(budget, 4_000n, NONCE + 1n, 100);
  const chain = events([ev({ nonce: NONCE, actualGasCost: 1_000n })]);
  const r = await sweepExpiredReservations(budget, chain, PAYMASTER, { nowSeconds: 100 + SWEEP_GRACE_SEC + 1, limit: 5 });
  assert.deepEqual(r, { settled: 1, released: 1 });
  // 1_000 remains charged
  assert.equal(await budget.reserve(SKEY, 9_000n, { keyCapWei: 10_000n }), true);
  assert.equal(await budget.reserve(SKEY, 1n, { keyCapWei: 10_000n }), false);
});

test("sweep deny: not before expiry + grace; a foreign-paymaster event does not count as landed; chain failure keeps the charge", async () => {
  const budget = new InMemorySponsorBudget({ globalDailyWei: 10_000n, now: () => 0 });
  await reserved(budget, 4_000n, NONCE, 100);
  assert.deepEqual(await sweepExpiredReservations(budget, events([]), PAYMASTER, { nowSeconds: 100 + SWEEP_GRACE_SEC, limit: 5 }), { settled: 0, released: 0 });
  const orig = console.error;
  console.error = () => {};
  try {
    const down = events(() => {
      throw new Error("rpc down");
    });
    assert.deepEqual(await sweepExpiredReservations(budget, down, PAYMASTER, { nowSeconds: 10_000, limit: 5 }), { settled: 0, released: 0 });
  } finally {
    console.error = orig;
  }
  assert.equal(await budget.reserve(SKEY, 6_001n, { keyCapWei: 10_000n }), false, "still charged after the failed read");
  // foreign paymaster's event with the same sender + nonce: released (we did not pay for it)
  const r = await sweepExpiredReservations(budget, events([ev({ paymaster: OTHER_PM })]), PAYMASTER, { nowSeconds: 10_000, limit: 5 });
  assert.deepEqual(r, { settled: 0, released: 1 });
});

test("handler: a session request sweeps the Safe's own expired reservations before reserving", async () => {
  enable();
  const now = Math.floor(Date.now() / 1000);
  const budget = new InMemorySponsorBudget({ globalDailyWei: 10n ** 18n });
  // an old voucher of this Safe that never landed, holding the whole session cap
  assert.ok(
    await budget.reserve(SKEY, 5n * 10n ** 16n, {
      keyCapWei: 5n * 10n ** 16n,
      reservation: { id: reservationIdOf(SAFE, NONCE + 99n), sender: SAFE, nonce: NONCE + 99n, expiresAt: now - 3600 },
    }),
  );
  const chain = fakeChain((w) => {
    migrateTo7579(w, SAFE);
    w.smartSession.add(SAFE.toLowerCase());
    const pids = permissionIdsOf({ legacy: LEGACY, signer: DEVICE_SIGNER, validUntil: now + 86_400 });
    w.permissionIds.set(SAFE.toLowerCase(), [pids.personalMint, pids.groupMint]);
  });
  const uo = {
    sender: SAFE,
    nonce: numberToHex(NONCE),
    callData: sessionClaimCallData(LEGACY, personalMintData()),
    callGasLimit: "0x493e0",
    verificationGasLimit: "0x7a120",
    preVerificationGas: "0xea60",
    maxFeePerGas: "0x77359400",
    maxPriorityFeePerGas: "0x3b9aca00",
    paymasterVerificationGasLimit: "0x249f0",
    paymasterPostOpGasLimit: "0xc350",
  };
  const b = { chainId: 100, userOp: uo, x: KEY.x, y: KEY.y, legacy: LEGACY, deviceAuth: await deviceAuthFor(uo) };
  const mk = () => new Request("http://localhost/api/passkey/sponsor", { method: "POST", body: JSON.stringify(b) });
  const without = await handleSponsorRequest(mk(), { chain, budget, sessionKeysEnabled: async () => true });
  assert.equal(without.status, 429, "no event reader = no sweep, the stale reservation still blocks");
  const res = await handleSponsorRequest(mk(), { chain, budget, sessionKeysEnabled: async () => true, events: events([]) });
  assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
});
