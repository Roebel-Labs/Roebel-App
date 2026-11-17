/**
 * Guest Safes (a passkey Safe without citizenship) may manage their guardians and join
 * Röbel Münzen (registerHuman, personalMint, profile sync) under the guest budget; every
 * other citizen action stays refused, alone or mixed into a guest op.
 * Run: cd apps/web && npx tsx --test src/lib/passkey/__tests__/sponsor-policy-guest.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeFunctionData, type Hex } from "viem";
import { ADDRESSES, evaluateSponsorPolicy, type SponsorContext } from "../sponsor-policy";
import { EVERYDAY_CONTRACTS as C, citizenNftAbi, hubAbi, nameRegistryAbi } from "../everyday-allowlist";
import { predictSafeAddress } from "../safe-address";
import { GUARDIAN, KEY, LEGACY, RECIPIENT, SAFE, fakeChain } from "./fake-chain";
import { NOW, deployOp, op, outer, srm, viaMultiSend } from "./policy-helpers";

const NO_LEGACY: SponsorContext = { ...KEY, nowSeconds: NOW };
const SENTINEL = "0x0000000000000000000000000000000000000001" as Hex;

// ---- calldata (same shapes as everyday-policy.test.ts) ----
const personalMint = encodeFunctionData({ abi: hubAbi, functionName: "personalMint" });
const groupMint = (group: Hex = C.roebelGroup) =>
  encodeFunctionData({ abi: hubAbi, functionName: "groupMint", args: [group, [LEGACY], [5n], "0x"] });
const trust = encodeFunctionData({ abi: hubAbi, functionName: "trust", args: [RECIPIENT, 4102444800n] });
const registerHuman = encodeFunctionData({ abi: hubAbi, functionName: "registerHuman", args: [RECIPIENT, `0x${"00".repeat(32)}`] });
const send = (from: Hex, id: bigint = BigInt(C.roebelGroup)) =>
  encodeFunctionData({ abi: hubAbi, functionName: "safeTransferFrom", args: [from, RECIPIENT, id, 10n ** 18n, "0x"] });
const metadata = encodeFunctionData({ abi: nameRegistryAbi, functionName: "updateMetadataDigest", args: [`0x${"12".repeat(32)}`] });
const askCitizen = encodeFunctionData({ abi: citizenNftAbi, functionName: "createAttestationRequest", args: ["Max, Röbel"] });

const add = encodeFunctionData({ abi: srm, functionName: "addGuardianWithThreshold", args: [GUARDIAN, 1n] });
const revoke = encodeFunctionData({ abi: srm, functionName: "revokeGuardianWithThreshold", args: [SENTINEL, GUARDIAN, 1n] });
const threshold = encodeFunctionData({ abi: srm, functionName: "changeThreshold", args: [1n] });
const cancel = encodeFunctionData({ abi: srm, functionName: "cancelRecovery" });

test("guest Safe: each guardian-management call is sponsored as a guest", async () => {
  for (const data of [add, revoke, threshold, cancel]) {
    const r = await evaluateSponsorPolicy(op(outer(ADDRESSES.socialRecoveryModule, data)), NO_LEGACY, fakeChain());
    assert.deepEqual(r, { ok: true, mode: "safe", budgetKey: SAFE, guest: true });
  }
});

test("guest Safe: sign-up batch = guardian + citizenship request, one op, deploy included", async () => {
  const fresh = { x: `0x${"aa".repeat(32)}` as Hex, y: `0x${"bb".repeat(32)}` as Hex };
  const r = await evaluateSponsorPolicy(
    deployOp(fresh, predictSafeAddress(fresh), viaMultiSend([{ to: ADDRESSES.socialRecoveryModule, data: add }, { to: C.citizenNft, data: askCitizen }])),
    { ...fresh, nowSeconds: NOW },
    fakeChain(),
  );
  assert.ok(r.ok && r.guest === true && r.budgetKey.toLowerCase() === predictSafeAddress(fresh).toLowerCase(), JSON.stringify(r));
});

test("guest Safe: registerHuman, personalMint and the profile sync are onboarding tier", async () => {
  for (const [to, data] of [[C.circlesHub, registerHuman], [C.circlesHub, personalMint], [C.circlesNameRegistry, metadata]] as const) {
    const r = await evaluateSponsorPolicy(op(outer(to, data)), NO_LEGACY, fakeChain());
    assert.ok(r.ok && r.mode === "everyday" && r.tier === "onboarding" && r.guest === true, JSON.stringify(r));
  }
});

test("guest Safe: groupMint, trust and sending Münzen stay citizen-only, alone or mixed in", async () => {
  for (const data of [groupMint(), trust, send(SAFE)]) {
    const alone = await evaluateSponsorPolicy(op(outer(C.circlesHub, data)), NO_LEGACY, fakeChain());
    assert.ok(!alone.ok && /citizen/.test(alone.reason), JSON.stringify(alone));
    const mixed = await evaluateSponsorPolicy(
      op(viaMultiSend([{ to: ADDRESSES.socialRecoveryModule, data: add }, { to: C.circlesHub, data }])),
      NO_LEGACY,
      fakeChain(),
    );
    assert.equal(mixed.ok, false);
    // Order does not matter: the citizen-only call first, guardian management after.
    const reversed = await evaluateSponsorPolicy(
      op(viaMultiSend([{ to: C.circlesHub, data }, { to: ADDRESSES.socialRecoveryModule, data: add }])),
      NO_LEGACY,
      fakeChain(),
    );
    assert.equal(reversed.ok, false);
  }
});

test("guest Safe: a guest-allowed everyday call mixed with a citizen-only one is refused as a whole", async () => {
  const r = await evaluateSponsorPolicy(
    op(viaMultiSend([
      { to: ADDRESSES.socialRecoveryModule, data: add },
      { to: C.circlesHub, data: personalMint },
      { to: C.circlesHub, data: groupMint() },
    ])),
    NO_LEGACY,
    fakeChain(),
  );
  assert.ok(!r.ok && /citizen/.test(r.reason), JSON.stringify(r));
});

test("guest Safe: a confirmRecovery rides along only with guardian management", async () => {
  const confirm = encodeFunctionData({ abi: srm, functionName: "confirmRecovery", args: [RECIPIENT, [GUARDIAN], 1n, false] });
  const withMgmt = await evaluateSponsorPolicy(
    op(viaMultiSend([{ to: ADDRESSES.socialRecoveryModule, data: add }, { to: ADDRESSES.socialRecoveryModule, data: confirm }])),
    NO_LEGACY,
    fakeChain(),
  );
  assert.deepEqual(withMgmt, { ok: true, mode: "safe", budgetKey: SAFE, guest: true });
  // Everyday + confirmRecovery without guardian management is not a guest shape.
  const withEveryday = await evaluateSponsorPolicy(
    op(viaMultiSend([{ to: C.circlesHub, data: personalMint }, { to: ADDRESSES.socialRecoveryModule, data: confirm }])),
    NO_LEGACY,
    fakeChain(),
  );
  assert.equal(withEveryday.ok, false);
});

test("a citizen Safe is not a guest", async () => {
  const r = await evaluateSponsorPolicy(
    op(outer(ADDRESSES.socialRecoveryModule, add)),
    NO_LEGACY,
    fakeChain((w) => w.citizens.add(SAFE.toLowerCase())),
  );
  assert.deepEqual(r, { ok: true, mode: "safe", budgetKey: SAFE });
});

test("an arbitrary sender that is not a genuine passkey Safe gets nothing", async () => {
  const r = await evaluateSponsorPolicy(op(outer(ADDRESSES.socialRecoveryModule, add), { sender: RECIPIENT }), NO_LEGACY, fakeChain());
  assert.equal(r.ok, false);
  const e = await evaluateSponsorPolicy(op(outer(C.circlesHub, personalMint), { sender: RECIPIENT }), NO_LEGACY, fakeChain());
  assert.equal(e.ok, false);
});
