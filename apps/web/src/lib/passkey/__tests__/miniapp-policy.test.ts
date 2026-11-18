/**
 * Sponsor mode "miniapp": a request that names a mini app is sponsored only when EVERY call
 * of the op is a declared contract + function of that app's reviewed version-2 manifest,
 * value 0, from a genuine passkey Safe (directly) or through the legacy account it administers.
 * Run: cd apps/web && npx tsx --test src/lib/passkey/__tests__/miniapp-policy.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeFunctionData, parseAbi, type Hex } from "viem";
import { rulesFor } from "../../miniapp/contracts";
import type { CallRule } from "@netizen-labs/miniapp-sdk/host";
import {
  ADDRESSES,
  ChainReadError,
  MINIAPP_FORBIDDEN_TARGETS,
  evaluateSponsorPolicy,
  parseSponsorRequest,
  type SponsorContext,
} from "../sponsor-policy";
import { hubAbi } from "../everyday-allowlist";
import { predictSafeAddress } from "../safe-address";
import { KEY, LEGACY, SAFE, brokenChain, fakeChain } from "./fake-chain";
import { HUB, NOW, deployOp, execLegacy, op, outer, srm, viaMultiSend } from "./policy-helpers";

const TARGET = "0x9a9a9a9a9a9a9a9a9a9a9a9a9a9a9a9a9a9a9a9a" as Hex;
const OTHER = "0x8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b" as Hex;
const APP_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3399";

const RULES = rulesFor([{ address: TARGET, label: "Trainingsbuch", functions: ["checkIn(uint256)"] }]);
const MINI: SponsorContext = { ...KEY, nowSeconds: NOW, miniApp: { id: APP_ID, rules: RULES } };
const fitness = parseAbi(["function checkIn(uint256)", "function checkOut(uint256)"]);
const checkIn = encodeFunctionData({ abi: fitness, functionName: "checkIn", args: [1n] });
const checkOut = encodeFunctionData({ abi: fitness, functionName: "checkOut", args: [1n] });
const personalMint = encodeFunctionData({ abi: hubAbi, functionName: "personalMint" });

/** Rules that (wrongly) declare `address` with checkIn, bypassing manifest validation. */
const rawRules = (address: Hex): CallRule[] => [
  { address: address.toLowerCase(), label: "x", selectors: { [checkIn.slice(0, 10)]: "checkIn(uint256)" } },
];

test("a declared call from a passkey Safe is sponsored in miniapp mode", async () => {
  const r = await evaluateSponsorPolicy(op(outer(TARGET, checkIn)), MINI, fakeChain());
  assert.deepEqual(r, { ok: true, mode: "miniapp", budgetKey: SAFE, miniAppId: APP_ID });
});

test("several declared calls in one batch are sponsored", async () => {
  const r = await evaluateSponsorPolicy(
    op(viaMultiSend([{ to: TARGET, data: checkIn }, { to: TARGET, data: checkIn }])),
    MINI,
    fakeChain(),
  );
  assert.equal(r.ok && r.mode, "miniapp");
});

test("a declared call through the legacy account is sponsored, budget key = legacy", async () => {
  const r = await evaluateSponsorPolicy(op(outer(LEGACY, execLegacy(TARGET, 0n, checkIn))), { ...MINI, legacy: LEGACY }, fakeChain());
  assert.deepEqual(r, { ok: true, mode: "miniapp", budgetKey: LEGACY, miniAppId: APP_ID });
});

test("through the legacy account the sender must be its admin", async () => {
  const r = await evaluateSponsorPolicy(
    op(outer(LEGACY, execLegacy(TARGET, 0n, checkIn))),
    { ...MINI, legacy: LEGACY },
    fakeChain((w) => w.admins.clear()),
  );
  assert.equal(r.ok, false);
});

test("the legacy account must be a thirdweb account proxy", async () => {
  const r = await evaluateSponsorPolicy(
    op(outer(LEGACY, execLegacy(TARGET, 0n, checkIn))),
    { ...MINI, legacy: LEGACY },
    fakeChain((w) => w.codes.delete(LEGACY.toLowerCase())),
  );
  assert.equal(r.ok, false);
});

test("with a legacy identity a direct declared call is refused", async () => {
  const r = await evaluateSponsorPolicy(op(outer(TARGET, checkIn)), { ...MINI, legacy: LEGACY }, fakeChain());
  assert.equal(r.ok, false);
});

test("a guest Safe is sponsored too", async () => {
  // The default world's SAFE holds no CitizenNFT.
  const chain = fakeChain((w) => w.citizens.delete(SAFE.toLowerCase()));
  const r = await evaluateSponsorPolicy(op(outer(TARGET, checkIn)), MINI, chain);
  assert.deepEqual(r, { ok: true, mode: "miniapp", budgetKey: SAFE, miniAppId: APP_ID });
});

test("a citizen Safe gets the same miniapp result", async () => {
  const chain = fakeChain((w) => w.citizens.add(SAFE.toLowerCase()));
  const r = await evaluateSponsorPolicy(op(outer(TARGET, checkIn)), MINI, chain);
  assert.deepEqual(r, { ok: true, mode: "miniapp", budgetKey: SAFE, miniAppId: APP_ID });
});

test("a deploy op with a declared call is sponsored under the factory check", async () => {
  const fresh = { x: `0x${"aa".repeat(32)}` as Hex, y: `0x${"bb".repeat(32)}` as Hex };
  const sender = predictSafeAddress(fresh);
  const r = await evaluateSponsorPolicy(
    deployOp(fresh, sender, outer(TARGET, checkIn)),
    { ...fresh, nowSeconds: NOW, miniApp: { id: APP_ID, rules: RULES } },
    fakeChain(),
  );
  assert.deepEqual(r, { ok: true, mode: "miniapp", budgetKey: sender, miniAppId: APP_ID });
});

test("an undeclared function on a declared contract is refused", async () => {
  const r = await evaluateSponsorPolicy(op(outer(TARGET, checkOut)), MINI, fakeChain());
  assert.equal(r.ok, false);
});

test("an undeclared contract is refused", async () => {
  const r = await evaluateSponsorPolicy(op(outer(OTHER, checkIn)), MINI, fakeChain());
  assert.equal(r.ok, false);
});

test("value above 0 is refused", async () => {
  // Through the legacy account (the only place a call carries its own value).
  const r = await evaluateSponsorPolicy(op(outer(LEGACY, execLegacy(TARGET, 1n, checkIn))), { ...MINI, legacy: LEGACY }, fakeChain());
  assert.equal(r.ok, false);
  const direct = await evaluateSponsorPolicy(op(outer(TARGET, checkIn, 0, 1n)), MINI, fakeChain());
  assert.equal(direct.ok, false);
  const inner = await evaluateSponsorPolicy(op(viaMultiSend([{ to: TARGET, data: checkIn, value: 1n }])), MINI, fakeChain());
  assert.equal(inner.ok, false);
});

test("a declared and an undeclared call in one batch refuse the whole op", async () => {
  const r = await evaluateSponsorPolicy(
    op(viaMultiSend([{ to: TARGET, data: checkIn }, { to: OTHER, data: checkIn }])),
    MINI,
    fakeChain(),
  );
  assert.equal(r.ok, false);
  const viaLegacy = await evaluateSponsorPolicy(
    op(
      outer(
        LEGACY,
        encodeFunctionData({
          abi: parseAbi(["function executeBatch(address[] target, uint256[] value, bytes[] calldata)"]),
          functionName: "executeBatch",
          args: [[TARGET, OTHER], [0n, 0n], [checkIn, checkIn]],
        }),
      ),
    ),
    { ...MINI, legacy: LEGACY },
    fakeChain(),
  );
  assert.equal(viaLegacy.ok, false);
});

test("a declared call next to an everyday call is refused", async () => {
  const r = await evaluateSponsorPolicy(
    op(viaMultiSend([{ to: TARGET, data: checkIn }, { to: HUB, data: personalMint }])),
    MINI,
    fakeChain((w) => w.citizens.add(SAFE.toLowerCase())),
  );
  assert.equal(r.ok, false);
});

test("an everyday call alone is refused when the request names a mini app", async () => {
  const citizen = fakeChain((w) => w.citizens.add(SAFE.toLowerCase()));
  const r = await evaluateSponsorPolicy(op(outer(HUB, personalMint)), MINI, citizen);
  assert.equal(r.ok, false);
  // Sanity: the same op without the mini app is sponsored (everyday).
  const plain = await evaluateSponsorPolicy(op(outer(HUB, personalMint)), { ...KEY, nowSeconds: NOW }, citizen);
  assert.equal(plain.ok, true);
});

test("guardian management is refused when the request names a mini app", async () => {
  const add = encodeFunctionData({ abi: srm, functionName: "addGuardianWithThreshold", args: [OTHER, 1n] });
  const r = await evaluateSponsorPolicy(op(outer(ADDRESSES.socialRecoveryModule, add)), MINI, fakeChain());
  assert.equal(r.ok, false);
});

test("a rule that targets the sender itself is refused", async () => {
  const r = await evaluateSponsorPolicy(
    op(outer(SAFE, checkIn)),
    { ...MINI, miniApp: { id: APP_ID, rules: rawRules(SAFE) } },
    fakeChain(),
  );
  assert.equal(r.ok, false);
});

test("a rule that targets the legacy account or the recovery module is refused", async () => {
  const viaLegacy = await evaluateSponsorPolicy(
    op(outer(LEGACY, execLegacy(LEGACY, 0n, checkIn))),
    { ...MINI, legacy: LEGACY, miniApp: { id: APP_ID, rules: rawRules(LEGACY) } },
    fakeChain(),
  );
  assert.equal(viaLegacy.ok, false);
  const srmRule = await evaluateSponsorPolicy(
    op(outer(ADDRESSES.socialRecoveryModule, checkIn)),
    { ...MINI, miniApp: { id: APP_ID, rules: rawRules(ADDRESSES.socialRecoveryModule) } },
    fakeChain(),
  );
  assert.equal(srmRule.ok, false);
  for (const a of MINIAPP_FORBIDDEN_TARGETS) {
    if (a.toLowerCase() === ADDRESSES.multiSendCallOnly.toLowerCase()) continue; // a plain CALL there is refused anyway
    const r = await evaluateSponsorPolicy(op(outer(a, checkIn)), { ...MINI, miniApp: { id: APP_ID, rules: rawRules(a) } }, fakeChain());
    assert.equal(r.ok, false, a);
  }
});

test("a sender that is not a genuine passkey Safe is refused", async () => {
  const r = await evaluateSponsorPolicy(
    op(outer(TARGET, checkIn)),
    MINI,
    fakeChain((w) => w.codes.delete(SAFE.toLowerCase())),
  );
  assert.equal(r.ok, false);
});

test("a chain read failure throws ChainReadError", async () => {
  await assert.rejects(evaluateSponsorPolicy(op(outer(TARGET, checkIn)), MINI, brokenChain()), ChainReadError);
});

test("parseSponsorRequest accepts a uuid miniApp and refuses anything else", () => {
  const body = {
    chainId: 100,
    x: KEY.x,
    y: KEY.y,
    userOp: {
      sender: SAFE,
      nonce: "0x0",
      callData: outer(TARGET, checkIn),
      callGasLimit: "0x1",
      verificationGasLimit: "0x1",
      preVerificationGas: "0x1",
      maxFeePerGas: "0x1",
      maxPriorityFeePerGas: "0x1",
      paymasterVerificationGasLimit: "0x1",
      paymasterPostOpGasLimit: "0x1",
    },
  };
  assert.equal(parseSponsorRequest(body).miniApp, undefined);
  assert.equal(parseSponsorRequest({ ...body, miniApp: APP_ID }).miniApp, APP_ID);
  assert.equal(parseSponsorRequest({ ...body, miniApp: APP_ID.toUpperCase() }).miniApp, APP_ID);
  for (const bad of ["roebel-data", 42, "", "3f2504e0-4f89-41d3-9a0c-0305e82c33", {}]) {
    assert.throws(() => parseSponsorRequest({ ...body, miniApp: bad }), String(bad));
  }
});
