/**
 * Mode E "detach" (thirdweb trennen): the passkey Safe submits the EOA-signed
 * setPermissionsForSigner{isAdmin: 2} that removes the thirdweb admin EOA.
 * Fork proof of the on-chain effect: contracts/passkey-accounts/test/PasskeyDetach.t.sol.
 * Run: cd apps/web && npx tsx --test src/lib/passkey/__tests__/sponsor-policy-detach.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeFunctionData, type Hex } from "viem";
import { ChainReadError, evaluateSponsorPolicy, type ChainReader, type SponsorContext, type SponsorUserOp } from "../sponsor-policy";
import { EOA, GUARDIAN, KEY, LEGACY, OTHER_LEGACY, RECIPIENT, SAFE, BAD_SIG, GOOD_SIG, brokenChain, fakeChain, type FakeWorld } from "./fake-chain";
import { HUB, NOW, PERSONAL_MINT, account, deployOp, execLegacy, handover, op, outer, permRequest, viaMultiSend } from "./policy-helpers";

const CTX: SponsorContext = { x: KEY.x, y: KEY.y, legacy: LEGACY, nowSeconds: NOW };
const G2 = "0x4545454545454545454545454545454545454545" as Hex;
const lc = (a: string) => a.toLowerCase();

const detachData = (signer: Hex = EOA, sig: Hex = GOOD_SIG, over: Partial<ReturnType<typeof permRequest>> = {}) =>
  encodeFunctionData({ abi: account, functionName: "setPermissionsForSigner", args: [{ ...permRequest(signer, 2), ...over }, sig] });
const detachOp = (signer: Hex = EOA, sig: Hex = GOOD_SIG, over = {}) => op(outer(LEGACY, detachData(signer, sig, over)));

/** The Safe has 2 guardians with threshold 2 (the detach precondition). */
function guarded(w: FakeWorld, count = 2, threshold = 2n) {
  const set = new Set<string>();
  if (count >= 1) set.add(lc(GUARDIAN));
  if (count >= 2) set.add(lc(G2));
  w.guardians.set(lc(SAFE), set);
  w.thresholds.set(lc(SAFE), threshold);
}

async function denied(o: SponsorUserOp, chain: ChainReader, ctx: SponsorContext, match: RegExp) {
  const r = await evaluateSponsorPolicy(o, ctx, chain);
  assert.equal(r.ok, false, "expected a denial");
  if (!r.ok) assert.match(r.reason, match);
}

test("detach: Safe (admin, 2 guardians, threshold 2) removes the thirdweb EOA → mode detach, budget = legacy", async () => {
  const chain = fakeChain((w) => guarded(w));
  const r = await evaluateSponsorPolicy(detachOp(), CTX, chain);
  assert.deepEqual(r, { ok: true, mode: "detach", budgetKey: LEGACY });
  assert.ok(chain.reads.includes("srmThreshold") && chain.reads.includes("guardiansCount"));
  assert.ok(chain.reads.includes("verifySignerPermissionRequest"));
});

test("detach attack: removing the Safe itself is refused before any chain read", async () => {
  const chain = fakeChain((w) => guarded(w));
  await denied(detachOp(SAFE), chain, CTX, /must not remove the sender Safe/);
  assert.equal(chain.reads.length, 0);
});

test("detach attack: a Safe that is not admin of the legacy account", async () => {
  const chain = fakeChain((w) => {
    guarded(w);
    w.admins.delete(`${lc(LEGACY)}:${lc(SAFE)}`);
  });
  await denied(detachOp(), chain, CTX, /sender is not an admin/);
});

test("detach attack: fewer than 2 guardians", async () => {
  await denied(detachOp(), fakeChain((w) => guarded(w, 1, 1n)), CTX, /at least 2 guardians/);
  await denied(detachOp(), fakeChain((w) => guarded(w, 0, 0n)), CTX, /at least 2 guardians/);
});

test("detach attack: 2 guardians but threshold 1", async () => {
  await denied(detachOp(), fakeChain((w) => guarded(w, 2, 1n)), CTX, /threshold of at least 2/);
});

test("detach attack: a bad or replayed signature", async () => {
  await denied(detachOp(EOA, BAD_SIG), fakeChain((w) => guarded(w)), CTX, /not a valid admin signature/);
  const replay = fakeChain((w) => {
    guarded(w);
    w.executedUids.add(`0x${"01".repeat(32)}`);
  });
  await denied(detachOp(), replay, CTX, /not a valid admin signature/);
});

test("detach attack: the admin to remove is not an admin", async () => {
  await denied(detachOp(RECIPIENT), fakeChain((w) => guarded(w)), CTX, /not an admin of the legacy account/);
});

test("detach attack: a non-citizen legacy account or a non-thirdweb target", async () => {
  await denied(detachOp(), fakeChain((w) => { guarded(w); w.citizens.delete(lc(LEGACY)); }), CTX, /holds no CitizenNFT/);
  await denied(detachOp(), fakeChain((w) => { guarded(w); w.codes.set(lc(LEGACY), "0x6080"); }), CTX, /not a legacy thirdweb account/);
});

test("detach attack: must be the only call (no batch riding along)", async () => {
  const chain = fakeChain((w) => guarded(w));
  const batch = viaMultiSend([
    { to: LEGACY, data: detachData() },
    { to: LEGACY, data: execLegacy(HUB, 0n, PERSONAL_MINT) },
  ]);
  await denied(op(batch), chain, CTX, /only call/);
  const withHandover = viaMultiSend([
    { to: LEGACY, data: handover() },
    { to: LEGACY, data: detachData() },
  ]);
  await denied(op(withHandover), chain, CTX, /only call/);
});

test("detach attack: isAdmin 2 inside legacy.execute stays rejected", async () => {
  const chain = fakeChain((w) => guarded(w));
  await denied(op(outer(LEGACY, execLegacy(LEGACY, 0n, detachData()))), chain, CTX, /isAdmin=2 not sponsorable/);
});

test("detach attack: a detach naming no legacy, or another legacy account", async () => {
  const chain = fakeChain((w) => guarded(w));
  await denied(detachOp(), chain, { ...CTX, legacy: undefined }, /legacy account/);
  await denied(op(outer(OTHER_LEGACY, detachData())), chain, CTX, /request's legacy account/);
});

test("detach attack: from a counterfactual (deploy) op", async () => {
  const chain = fakeChain((w) => guarded(w));
  await denied(deployOp(KEY, SAFE, outer(LEGACY, detachData())), chain, CTX, /already deployed passkey Safe/);
});

test("detach attack: odd request fields and an expired request", async () => {
  const chain = fakeChain((w) => guarded(w));
  await denied(detachOp(EOA, GOOD_SIG, { approvedTargets: [RECIPIENT] }), chain, CTX, /no targets/);
  await denied(detachOp(EOA, GOOD_SIG, { permissionEndTimestamp: 1n }), chain, CTX, /no permission window/);
  await denied(detachOp(EOA, GOOD_SIG, { reqValidityEndTimestamp: BigInt(NOW - 1) }), chain, CTX, /validity window/);
});

test("detach: isAdmin 3+ (any other removal value) is still rejected", async () => {
  const chain = fakeChain((w) => guarded(w));
  const data = encodeFunctionData({ abi: account, functionName: "setPermissionsForSigner", args: [permRequest(EOA, 3), GOOD_SIG] });
  await denied(op(outer(LEGACY, data)), chain, CTX, /isAdmin=3 not sponsorable/);
});

test("detach: a chain failure throws ChainReadError (fail closed)", async () => {
  await assert.rejects(evaluateSponsorPolicy(detachOp(), CTX, brokenChain()), ChainReadError);
});
