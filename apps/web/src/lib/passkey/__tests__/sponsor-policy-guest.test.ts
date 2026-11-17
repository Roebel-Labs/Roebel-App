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
import {
  GUARDIAN,
  KEY,
  LEGACY,
  RECIPIENT,
  RECOVERED_SIGNER,
  SAFE,
  fakeChain,
  makePasskeySafe,
  signerKey,
  type FakeWorld,
} from "./fake-chain";
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

// ---- recovering a guest Safe (mode C without citizenship) ----

const WALLET = "0x9999999999999999999999999999999999999999" as Hex;
const OTHER_KEY = { x: `0x${"cc".repeat(32)}` as Hex, y: `0x${"dd".repeat(32)}` as Hex };
const guestWallet = (w: FakeWorld) => {
  makePasskeySafe(w, WALLET, OTHER_KEY);
  w.guardians.set(WALLET.toLowerCase(), new Set([SAFE.toLowerCase()]));
  w.webauthnSigners.set(signerKey(KEY), RECOVERED_SIGNER);
};

test("recovering a guest Safe: confirmRecovery by a guardian Safe is sponsored as a guest", async () => {
  const confirm = encodeFunctionData({ abi: srm, functionName: "confirmRecovery", args: [WALLET, [RECOVERED_SIGNER], 1n, false] });
  const r = await evaluateSponsorPolicy(op(outer(ADDRESSES.socialRecoveryModule, confirm)), NO_LEGACY, fakeChain(guestWallet));
  assert.deepEqual(r, { ok: true, mode: "recovery", budgetKey: WALLET, guest: true });
});

test("recovering a guest Safe: executeRecovery to the submitter's own signer", async () => {
  const exec = encodeFunctionData({ abi: srm, functionName: "executeRecovery", args: [WALLET, [RECOVERED_SIGNER], 1n] });
  const r = await evaluateSponsorPolicy(op(outer(ADDRESSES.socialRecoveryModule, exec)), NO_LEGACY, fakeChain(guestWallet));
  assert.ok(r.ok && r.guest === true, JSON.stringify(r));
});

test("a wallet that is not a sovereign Safe, or has no guardian, is refused", async () => {
  const exec = encodeFunctionData({ abi: srm, functionName: "executeRecovery", args: [RECIPIENT, [RECOVERED_SIGNER], 1n] });
  assert.equal((await evaluateSponsorPolicy(op(outer(ADDRESSES.socialRecoveryModule, exec)), NO_LEGACY, fakeChain(guestWallet))).ok, false);
  const noGuardian = (w: FakeWorld) => {
    guestWallet(w);
    w.guardians.delete(WALLET.toLowerCase());
  };
  const exec2 = encodeFunctionData({ abi: srm, functionName: "executeRecovery", args: [WALLET, [RECOVERED_SIGNER], 1n] });
  assert.equal((await evaluateSponsorPolicy(op(outer(ADDRESSES.socialRecoveryModule, exec2)), NO_LEGACY, fakeChain(noGuardian))).ok, false);
});

test("recovering a guest Safe: the other recovery rules still hold", async () => {
  // executeRecovery to someone else's signer.
  const toOther = encodeFunctionData({ abi: srm, functionName: "executeRecovery", args: [WALLET, [GUARDIAN], 1n] });
  const a = await evaluateSponsorPolicy(op(outer(ADDRESSES.socialRecoveryModule, toOther)), NO_LEGACY, fakeChain(guestWallet));
  assert.ok(!a.ok && /own passkey signer/.test(a.reason), JSON.stringify(a));
  // confirmRecovery by a Safe that is not a guardian of the wallet.
  const confirm = encodeFunctionData({ abi: srm, functionName: "confirmRecovery", args: [WALLET, [RECOVERED_SIGNER], 1n, false] });
  const notGuardian = (w: FakeWorld) => {
    guestWallet(w);
    w.guardians.set(WALLET.toLowerCase(), new Set([GUARDIAN.toLowerCase()]));
  };
  const b = await evaluateSponsorPolicy(op(outer(ADDRESSES.socialRecoveryModule, confirm)), NO_LEGACY, fakeChain(notGuardian));
  assert.ok(!b.ok && /not a guardian/.test(b.reason), JSON.stringify(b));
  // finalizeRecovery before the delay is over.
  const finalize = encodeFunctionData({ abi: srm, functionName: "finalizeRecovery", args: [WALLET] });
  const pending = (w: FakeWorld) => {
    guestWallet(w);
    w.recoveryRequests.set(WALLET.toLowerCase(), { executeAfter: BigInt(NOW + 60), newThreshold: 1n, newOwners: [RECOVERED_SIGNER] });
  };
  const c = await evaluateSponsorPolicy(op(outer(ADDRESSES.socialRecoveryModule, finalize)), NO_LEGACY, fakeChain(pending));
  assert.ok(!c.ok && /still pending/.test(c.reason), JSON.stringify(c));
  const due = (w: FakeWorld) => {
    guestWallet(w);
    w.recoveryRequests.set(WALLET.toLowerCase(), { executeAfter: BigInt(NOW - 60), newThreshold: 1n, newOwners: [RECOVERED_SIGNER] });
  };
  const d = await evaluateSponsorPolicy(op(outer(ADDRESSES.socialRecoveryModule, finalize)), NO_LEGACY, fakeChain(due));
  assert.deepEqual(d, { ok: true, mode: "recovery", budgetKey: WALLET, guest: true });
});

test("recovering a guest Safe: a wallet without the recovery module, or with two owners, is refused", async () => {
  const exec = encodeFunctionData({ abi: srm, functionName: "executeRecovery", args: [WALLET, [RECOVERED_SIGNER], 1n] });
  const noSrm = (w: FakeWorld) => {
    guestWallet(w);
    w.modules.delete(`${WALLET.toLowerCase()}:${ADDRESSES.socialRecoveryModule.toLowerCase()}`);
  };
  const a = await evaluateSponsorPolicy(op(outer(ADDRESSES.socialRecoveryModule, exec)), NO_LEGACY, fakeChain(noSrm));
  assert.ok(!a.ok && /SocialRecoveryModule/.test(a.reason), JSON.stringify(a));
  const twoOwners = (w: FakeWorld) => {
    guestWallet(w);
    w.owners.set(WALLET.toLowerCase(), [RECIPIENT, GUARDIAN]);
  };
  const b = await evaluateSponsorPolicy(op(outer(ADDRESSES.socialRecoveryModule, exec)), NO_LEGACY, fakeChain(twoOwners));
  assert.ok(!b.ok && /exactly one owner/.test(b.reason), JSON.stringify(b));
});

test("recovering a citizen Safe carries no guest flag", async () => {
  const exec = encodeFunctionData({ abi: srm, functionName: "executeRecovery", args: [WALLET, [RECOVERED_SIGNER], 1n] });
  const citizenWallet = (w: FakeWorld) => {
    guestWallet(w);
    w.citizens.add(WALLET.toLowerCase());
  };
  const r = await evaluateSponsorPolicy(op(outer(ADDRESSES.socialRecoveryModule, exec)), NO_LEGACY, fakeChain(citizenWallet));
  assert.deepEqual(r, { ok: true, mode: "recovery", budgetKey: WALLET });
});
