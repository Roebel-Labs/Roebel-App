/**
 * Migration (v3 moveTo, counterfactual legacy deploy) and recovery shapes of the
 * sponsor policy.
 * Run: cd apps/web && npx tsx --test src/lib/passkey/__tests__/sponsor-policy-migration.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeFunctionData, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  ADDRESSES,
  ChainReadError,
  evaluateSponsorPolicy,
  type ChainReader,
  type SponsorContext,
  type SponsorUserOp,
} from "../sponsor-policy";
import { WEBAUTHN_VERIFIERS, predictSafeAddress } from "../safe-address";
import {
  EOA,
  GUARDIAN,
  KEY,
  LEGACY,
  OTHER_LEGACY,
  RECIPIENT,
  SAFE,
  V3_ATTESTER,
  V3_CITIZEN,
  brokenChain,
  fakeChain,
  makePasskeySafe,
  type FakeWorld,
} from "./fake-chain";
import {
  NOW,
  createAccount,
  createSigner,
  deployOp,
  execLegacy,
  handover,
  moveTo,
  op,
  outer,
  permRequest,
  signerPermissionTypes,
  srm,
  viaMultiSend,
} from "./policy-helpers";

const V3 = { citizenNft: V3_CITIZEN, attesterNft: V3_ATTESTER };
const CTX: SponsorContext = { x: KEY.x, y: KEY.y, legacy: LEGACY, nowSeconds: NOW, v3: V3 };
const NO_LEGACY: SponsorContext = { x: KEY.x, y: KEY.y, nowSeconds: NOW, v3: V3 };
const SRM = ADDRESSES.socialRecoveryModule;
const lc = (a: string) => a.toLowerCase();

async function ok(o: SponsorUserOp, chain: ChainReader, ctx: SponsorContext, budgetKey: Hex, mode?: string) {
  const r = await evaluateSponsorPolicy(o, ctx, chain);
  assert.equal(r.ok, true, r.ok ? "" : `expected ok, got: ${r.reason}`);
  if (r.ok) {
    assert.equal(lc(r.budgetKey), lc(budgetKey), "budget key");
    if (mode) assert.equal(r.mode, mode);
  }
}
async function rejected(o: SponsorUserOp, re: RegExp, chain: ChainReader, ctx: SponsorContext) {
  const r = await evaluateSponsorPolicy(o, ctx, chain);
  assert.equal(r.ok, false, "expected rejection");
  if (!r.ok) assert.match(r.reason, re);
}

const notAdmin = (w: FakeWorld) => w.admins.delete(lc(`${LEGACY}:${SAFE}`));

// =====================================================================
// 1. v3 moveTo via legacy.execute
// =====================================================================

test("moveTo(sender) on the configured CitizenNFTv3 / AttesterNFTv3 through legacy.execute", async () => {
  await ok(op(outer(LEGACY, execLegacy(V3_CITIZEN, 0n, moveTo(SAFE)))), fakeChain(), CTX, LEGACY, "legacy");
  await ok(op(outer(LEGACY, execLegacy(V3_ATTESTER, 0n, moveTo(SAFE)))), fakeChain(), CTX, LEGACY);
  const both = encodeFunctionData({
    abi: (await import("./policy-helpers")).account,
    functionName: "executeBatch",
    args: [[V3_CITIZEN, V3_ATTESTER], [0n, 0n], [moveTo(SAFE), moveTo(SAFE)]],
  });
  await ok(op(outer(LEGACY, both)), fakeChain(), CTX, LEGACY);
});

test("one-op migration from a counterfactual Safe: deploy + handover + moveTo + guardian", async () => {
  const chain = fakeChain((w) => {
    notAdmin(w);
    w.codes.delete(lc(SAFE));
  });
  await ok(
    deployOp(
      KEY,
      SAFE,
      viaMultiSend([
        { to: LEGACY, data: handover() },
        { to: LEGACY, data: execLegacy(V3_CITIZEN, 0n, moveTo(SAFE)) },
        { to: SRM, data: encodeFunctionData({ abi: srm, functionName: "addGuardianWithThreshold", args: [GUARDIAN, 1n] }) },
      ]),
    ),
    chain,
    CTX,
    LEGACY,
  );
});

test("attack: moveTo to a third address (direct, batched, or before the handover)", async () => {
  await rejected(op(outer(LEGACY, execLegacy(V3_CITIZEN, 0n, moveTo(RECIPIENT)))), /sender Safe/, fakeChain(), CTX);
  const batch = encodeFunctionData({
    abi: (await import("./policy-helpers")).account,
    functionName: "executeBatch",
    args: [[V3_CITIZEN, V3_ATTESTER], [0n, 0n], [moveTo(SAFE), moveTo(RECIPIENT)]],
  });
  await rejected(op(outer(LEGACY, batch)), /sender Safe/, fakeChain(), CTX);
  await rejected(op(outer(LEGACY, execLegacy(V3_CITIZEN, 1n, moveTo(SAFE)))), /value/, fakeChain(), CTX);
});

test("attack: moveTo on an address that is not the configured v3 contract", async () => {
  await rejected(op(outer(LEGACY, execLegacy(RECIPIENT, 0n, moveTo(SAFE)))), /configured/, fakeChain(), CTX);
  // Only the citizen contract configured: the attester move is rejected.
  await rejected(
    op(outer(LEGACY, execLegacy(V3_ATTESTER, 0n, moveTo(SAFE)))),
    /configured/,
    fakeChain(),
    { ...CTX, v3: { citizenNft: V3_CITIZEN } },
  );
});

test("attack: v3 unconfigured - every moveTo shape is rejected, without chain reads", async () => {
  const chain = fakeChain();
  for (const v3 of [undefined, {}]) {
    await rejected(op(outer(LEGACY, execLegacy(V3_CITIZEN, 0n, moveTo(SAFE)))), /not enabled/, chain, { ...CTX, v3 });
  }
  assert.deepEqual(chain.reads, []);
});

test("moveTo still needs the sender bound to legacy (admin or handover)", async () => {
  await rejected(op(outer(LEGACY, execLegacy(V3_CITIZEN, 0n, moveTo(SAFE)))), /not an admin/, fakeChain(notAdmin), CTX);
});

// =====================================================================
// 2. Deploying an undeployed (counterfactual) legacy account
// =====================================================================

const ADMIN_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"; // anvil #1, test-only
const admin = privateKeyToAccount(ADMIN_KEY);

async function adminHandoverSig(legacy: Hex = LEGACY, signer = admin, over: Partial<ReturnType<typeof permRequest>> = {}) {
  return signer.signTypedData({
    domain: { name: "Account", version: "1", chainId: 100, verifyingContract: legacy },
    types: signerPermissionTypes,
    primaryType: "SignerPermissionRequest",
    message: { ...permRequest(SAFE), ...over },
  });
}

/** LEGACY is counterfactual: no code, factory.getAddress(admin, 0x) == LEGACY, still a v2 citizen. */
const counterfactualLegacy = (mutate?: (w: FakeWorld) => void) =>
  fakeChain((w) => {
    w.codes.delete(lc(LEGACY));
    notAdmin(w);
    w.legacyAddresses.set(lc(admin.address), LEGACY);
    mutate?.(w);
  });

test("createAccount(admin, 0x) as call #0, then an admin-signed handover + moveTo", async () => {
  const sig = await adminHandoverSig();
  const chain = counterfactualLegacy();
  await ok(
    op(
      viaMultiSend([
        { to: ADDRESSES.legacyAccountFactory, data: createAccount(admin.address) },
        { to: LEGACY, data: handover(sig) },
        { to: LEGACY, data: execLegacy(V3_CITIZEN, 0n, moveTo(SAFE)) },
      ]),
    ),
    chain,
    CTX,
    LEGACY,
  );
  // The handover is checked by ECDSA recovery (the account has no code for an eth_call).
  assert.equal(chain.reads.includes("verifySignerPermissionRequest"), false);
  assert.ok(chain.reads.includes("getLegacyAccountAddress"));
});

test("attack: createAccount whose result is not the request's legacy", async () => {
  const sig = await adminHandoverSig();
  const calls = viaMultiSend([
    { to: ADDRESSES.legacyAccountFactory, data: createAccount(admin.address) },
    { to: LEGACY, data: handover(sig) },
  ]);
  await rejected(op(calls), /does not deploy/, counterfactualLegacy((w) => w.legacyAddresses.set(lc(admin.address), OTHER_LEGACY)), CTX);
  // Another admin (whose account is some other address) signs its own handover.
  const other = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");
  await rejected(
    op(
      viaMultiSend([
        { to: ADDRESSES.legacyAccountFactory, data: createAccount(other.address) },
        { to: LEGACY, data: handover(await adminHandoverSig(LEGACY, other)) },
      ]),
    ),
    /does not deploy/,
    counterfactualLegacy(),
    CTX,
  );
});

test("attack: createAccount not as the first call, with data, or without a legacy", async () => {
  const sig = await adminHandoverSig();
  const chain = counterfactualLegacy();
  await rejected(
    op(
      viaMultiSend([
        { to: LEGACY, data: handover(sig) },
        { to: ADDRESSES.legacyAccountFactory, data: createAccount(admin.address) },
      ]),
    ),
    /first call/,
    chain,
    CTX,
  );
  await rejected(op(outer(ADDRESSES.legacyAccountFactory, createAccount(admin.address, "0x01"))), /data must be empty/, chain, CTX);
  await rejected(op(outer(ADDRESSES.legacyAccountFactory, createAccount(admin.address))), /legacy/, chain, NO_LEGACY);
  assert.deepEqual(chain.reads, []);
});

test("attack: createAccount for an already deployed legacy", async () => {
  const sig = await adminHandoverSig();
  const chain = fakeChain((w) => w.legacyAddresses.set(lc(admin.address), LEGACY));
  await rejected(
    op(viaMultiSend([
      { to: ADDRESSES.legacyAccountFactory, data: createAccount(admin.address) },
      { to: LEGACY, data: handover(sig) },
    ])),
    /already deployed/,
    chain,
    CTX,
  );
});

test("attack: a fresh legacy with a foreign / high-s handover signature, or execute before the handover", async () => {
  const stranger = privateKeyToAccount("0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6");
  const first = { to: ADDRESSES.legacyAccountFactory, data: createAccount(admin.address) };
  await rejected(
    op(viaMultiSend([first, { to: LEGACY, data: handover(await adminHandoverSig(LEGACY, stranger)) }])),
    /handover signature/,
    counterfactualLegacy(),
    CTX,
  );
  // Same signature, malleated to high-s (OZ ECDSA would revert).
  const sig = await adminHandoverSig();
  const n = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
  const s = BigInt(`0x${sig.slice(66, 130)}`);
  const v = parseInt(sig.slice(130, 132), 16);
  const highS = `${sig.slice(0, 66)}${(n - s).toString(16).padStart(64, "0")}${(v === 27 ? 28 : 27).toString(16)}` as Hex;
  await rejected(op(viaMultiSend([first, { to: LEGACY, data: handover(highS) }])), /handover signature/, counterfactualLegacy(), CTX);
  // Signed for another request (uid) than the one submitted.
  const otherUid = await adminHandoverSig(LEGACY, admin, { uid: `0x${"09".repeat(32)}` });
  await rejected(op(viaMultiSend([first, { to: LEGACY, data: handover(otherUid) }])), /handover signature/, counterfactualLegacy(), CTX);
  // execute / SRM before any handover on a fresh account.
  await rejected(
    op(viaMultiSend([first, { to: LEGACY, data: execLegacy(RECIPIENT, 0n, "0x") }, { to: LEGACY, data: handover(sig) }])),
    /handover before/,
    counterfactualLegacy(),
    CTX,
  );
});

test("a counterfactual legacy without createAccount is still rejected", async () => {
  await rejected(op(outer(LEGACY, handover())), /not a legacy thirdweb account/, counterfactualLegacy(), CTX);
});

// =====================================================================
// 3. Guardian management with the Safe itself as the identity (after moveTo)
// =====================================================================

const guardianCalls: Hex[] = [
  encodeFunctionData({ abi: srm, functionName: "addGuardianWithThreshold", args: [GUARDIAN, 1n] }),
  encodeFunctionData({ abi: srm, functionName: "revokeGuardianWithThreshold", args: [RECIPIENT, GUARDIAN, 1n] }),
  encodeFunctionData({ abi: srm, functionName: "changeThreshold", args: [2n] }),
  encodeFunctionData({ abi: srm, functionName: "cancelRecovery" }),
];
const citizenSafe = (w: FakeWorld) => w.citizensV3.add(lc(SAFE));

test("a citizen Safe (v3 holder) manages its guardians without naming a legacy", async () => {
  for (const c of guardianCalls) await ok(op(outer(SRM, c)), fakeChain(citizenSafe), NO_LEGACY, SAFE, "safe");
  await ok(op(viaMultiSend(guardianCalls.map((data) => ({ to: SRM, data })))), fakeChain(citizenSafe), NO_LEGACY, SAFE);
});

test("attack: guardian management by a non-citizen Safe, or with v3 unset", async () => {
  for (const c of guardianCalls) {
    await rejected(op(outer(SRM, c)), /no CitizenNFT/, fakeChain(), NO_LEGACY);
    await rejected(op(outer(SRM, c)), /no CitizenNFT/, fakeChain(citizenSafe), { ...NO_LEGACY, v3: undefined });
  }
});

test("a citizen Safe must still be a genuine passkey Safe for (x, y)", async () => {
  await rejected(
    op(outer(SRM, guardianCalls[0])),
    /owner/,
    fakeChain((w) => {
      citizenSafe(w);
      w.sharedConfig.set(lc(SAFE), { x: 1n, y: 2n, verifiers: WEBAUTHN_VERIFIERS });
    }),
    NO_LEGACY,
  );
});

// =====================================================================
// 4. Recovery submitted by the recovering person's NEW passkey Safe
// =====================================================================

const NEW_KEY = { x: `0x${"a1".repeat(32)}` as Hex, y: `0x${"b2".repeat(32)}` as Hex };
const NEW_SAFE = predictSafeAddress(NEW_KEY);
const NEW_SIGNER = "0x5151515151515151515151515151515151515151" as Hex;
const WALLET = "0x2222222222222222222222222222222222222222" as Hex; // the Safe being recovered
const NEW_CTX: SponsorContext = { x: NEW_KEY.x, y: NEW_KEY.y, nowSeconds: NOW, v3: V3 };
const SIG = [{ signer: GUARDIAN, signature: "0x1234" as Hex }];

const multiConfirm = (wallet = WALLET, owners: Hex[] = [NEW_SIGNER], t = 1n) =>
  encodeFunctionData({ abi: srm, functionName: "multiConfirmRecovery", args: [wallet, owners, t, SIG, true] });
const executeRecovery = (wallet = WALLET, owners: Hex[] = [NEW_SIGNER]) =>
  encodeFunctionData({ abi: srm, functionName: "executeRecovery", args: [wallet, owners, 1n] });
const finalize = (wallet = WALLET) => encodeFunctionData({ abi: srm, functionName: "finalizeRecovery", args: [wallet] });
const confirm = (wallet = WALLET, owners: Hex[] = [NEW_SIGNER]) =>
  encodeFunctionData({ abi: srm, functionName: "confirmRecovery", args: [wallet, owners, 1n, false] });

/** WALLET is a v3 citizen with guardians GUARDIAN + SAFE (SAFE = a family member's passkey Safe). */
const recoveryWorld = (mutate?: (w: FakeWorld) => void) =>
  fakeChain((w) => {
    w.citizensV3.add(lc(WALLET));
    w.guardians.set(lc(WALLET), new Set([lc(GUARDIAN), lc(SAFE)]));
    w.webauthnSigners.set(`${BigInt(NEW_KEY.x)}:${BigInt(NEW_KEY.y)}:${WEBAUTHN_VERIFIERS}`, NEW_SIGNER);
    mutate?.(w);
  });
const firstRecoveryOp = (calls: Array<{ to: Hex; data: Hex }> = [
  { to: ADDRESSES.signerFactory, data: createSigner(NEW_KEY, WEBAUTHN_VERIFIERS) },
  { to: SRM, data: multiConfirm() },
]) => deployOp(NEW_KEY, NEW_SAFE, viaMultiSend(calls));

test("new Safe: deploy + createSigner + multiConfirmRecovery(execute) for a citizen wallet", async () => {
  await ok(firstRecoveryOp(), recoveryWorld(), NEW_CTX, WALLET, "recovery");
  await ok(deployOp(NEW_KEY, NEW_SAFE, outer(SRM, executeRecovery())), recoveryWorld(), NEW_CTX, WALLET);
});

test("new Safe: finalizeRecovery once the delay is over and the owners are its own signer", async () => {
  const pending = (executeAfter: bigint, owners: Hex[] = [NEW_SIGNER]) =>
    recoveryWorld((w) => {
      makePasskeySafe(w, NEW_SAFE, NEW_KEY);
      w.recoveryRequests.set(lc(WALLET), { executeAfter, newThreshold: 1n, newOwners: owners });
    });
  await ok(op(outer(SRM, finalize()), { sender: NEW_SAFE }), pending(BigInt(NOW - 1)), NEW_CTX, WALLET);
  await rejected(op(outer(SRM, finalize()), { sender: NEW_SAFE }), /still pending/, pending(BigInt(NOW + 100)), NEW_CTX);
  await rejected(op(outer(SRM, finalize()), { sender: NEW_SAFE }), /no pending/, pending(0n), NEW_CTX);
  await rejected(op(outer(SRM, finalize()), { sender: NEW_SAFE }), /submitter's passkey/, pending(BigInt(NOW - 1), [RECIPIENT]), NEW_CTX);
});

test("a wallet that is a citizen through its legacy account (recoveryLegacy + isAdmin)", async () => {
  const world = (linked: boolean) =>
    recoveryWorld((w) => {
      w.citizensV3.delete(lc(WALLET));
      if (linked) w.admins.add(lc(`${LEGACY}:${WALLET}`));
    });
  await ok(firstRecoveryOp(), world(true), { ...NEW_CTX, recoveryLegacy: LEGACY }, WALLET);
  await rejected(firstRecoveryOp(), /not a citizen/, world(false), { ...NEW_CTX, recoveryLegacy: LEGACY });
  await rejected(firstRecoveryOp(), /not a citizen/, world(true), NEW_CTX);
  // recoveryLegacy that is not a thirdweb account / not a citizen.
  await rejected(firstRecoveryOp(), /not a citizen/, world(true), { ...NEW_CTX, recoveryLegacy: RECIPIENT });
  await rejected(
    firstRecoveryOp(),
    /not a citizen/,
    recoveryWorld((w) => {
      w.citizensV3.delete(lc(WALLET));
      w.admins.add(lc(`${LEGACY}:${WALLET}`));
      w.citizens.delete(lc(LEGACY));
    }),
    { ...NEW_CTX, recoveryLegacy: LEGACY },
  );
});

test("attack: recovery of a non-citizen wallet, or of a wallet without guardians", async () => {
  await rejected(firstRecoveryOp(), /not a citizen/, recoveryWorld((w) => w.citizensV3.delete(lc(WALLET))), NEW_CTX);
  await rejected(firstRecoveryOp(), /not a citizen/, recoveryWorld(), { ...NEW_CTX, v3: undefined });
  await rejected(firstRecoveryOp(), /no guardians/, recoveryWorld((w) => w.guardians.delete(lc(WALLET))), NEW_CTX);
});

test("attack: recovery that hands the wallet to anyone but the submitter's own signer", async () => {
  await rejected(
    firstRecoveryOp([{ to: SRM, data: multiConfirm(WALLET, [RECIPIENT]) }]),
    /submitter's own passkey signer/,
    recoveryWorld(),
    NEW_CTX,
  );
  await rejected(firstRecoveryOp([{ to: SRM, data: multiConfirm(WALLET, [NEW_SIGNER, RECIPIENT], 1n) }]), /exactly one/, recoveryWorld(), NEW_CTX);
  await rejected(firstRecoveryOp([{ to: SRM, data: multiConfirm(WALLET, [NEW_SIGNER], 2n) }]), /exactly one/, recoveryWorld(), NEW_CTX);
  await rejected(
    firstRecoveryOp([{ to: ADDRESSES.signerFactory, data: createSigner(KEY, WEBAUTHN_VERIFIERS) }, { to: SRM, data: multiConfirm() }]),
    /own passkey/,
    recoveryWorld(),
    NEW_CTX,
  );
  await rejected(
    firstRecoveryOp([{ to: ADDRESSES.signerFactory, data: createSigner(NEW_KEY, 1n) }, { to: SRM, data: multiConfirm() }]),
    /own passkey/,
    recoveryWorld(),
    NEW_CTX,
  );
});

test("attack: recovery ops mixing wallets, identity calls, a legacy, or targeting the sender", async () => {
  await rejected(
    firstRecoveryOp([{ to: SRM, data: multiConfirm() }, { to: SRM, data: finalize(RECIPIENT) }]),
    /same wallet/,
    recoveryWorld(),
    NEW_CTX,
  );
  await rejected(
    firstRecoveryOp([{ to: SRM, data: multiConfirm() }, { to: SRM, data: guardianCalls[0] }]),
    /mixed/,
    recoveryWorld(),
    NEW_CTX,
  );
  await rejected(
    firstRecoveryOp([{ to: SRM, data: multiConfirm() }, { to: LEGACY, data: execLegacy(RECIPIENT, 0n, "0x") }]),
    /legacy|mixed/,
    recoveryWorld(),
    { ...NEW_CTX, legacy: LEGACY },
  );
  await rejected(firstRecoveryOp(), /must not name a legacy/, recoveryWorld(), { ...NEW_CTX, legacy: LEGACY });
  await rejected(firstRecoveryOp([{ to: SRM, data: multiConfirm(NEW_SAFE) }]), /own recovery/, recoveryWorld(), NEW_CTX);
  await rejected(
    firstRecoveryOp([{ to: ADDRESSES.signerFactory, data: createSigner(NEW_KEY, WEBAUTHN_VERIFIERS) }]),
    /names no wallet/,
    recoveryWorld(),
    NEW_CTX,
  );
});

test("attack: a recovery op from something that is not a passkey Safe for (x, y)", async () => {
  await rejected(op(outer(SRM, multiConfirm()), { sender: RECIPIENT }), /not a passkey Safe/, recoveryWorld(), NEW_CTX);
  // The deploy op must be for the request's key.
  await rejected(deployOp(KEY, NEW_SAFE, outer(SRM, multiConfirm())), /factoryData/, recoveryWorld(), NEW_CTX);
});

// =====================================================================
// 5. A guardian's own confirmRecovery from ANY passkey Safe (family member)
// =====================================================================

// SAFE (key KEY) is the family member's passkey Safe: not a citizen, guardian of WALLET.
test("family guardian (non-citizen passkey Safe) confirms the recovery of a citizen wallet", async () => {
  await ok(op(outer(SRM, confirm())), recoveryWorld(), NO_LEGACY, WALLET, "recovery");
  // Counterfactual family Safe: its first op deploys it and confirms.
  const FAMILY_KEY = { x: `0x${"c3".repeat(32)}` as Hex, y: `0x${"d4".repeat(32)}` as Hex };
  const family = predictSafeAddress(FAMILY_KEY);
  await ok(
    deployOp(FAMILY_KEY, family, outer(SRM, confirm())),
    recoveryWorld((w) => w.guardians.get(lc(WALLET))!.add(lc(family))),
    { ...NO_LEGACY, ...FAMILY_KEY },
    WALLET,
  );
});

test("attack: family Safe confirming for a non-citizen wallet, or when it is not a guardian", async () => {
  await rejected(op(outer(SRM, confirm())), /not a citizen/, recoveryWorld((w) => w.citizensV3.delete(lc(WALLET))), NO_LEGACY);
  await rejected(op(outer(SRM, confirm())), /not a guardian/, recoveryWorld((w) => w.guardians.set(lc(WALLET), new Set([lc(GUARDIAN)]))), NO_LEGACY);
});

test("attack: a family Safe trying anything other than confirmRecovery", async () => {
  const world = recoveryWorld();
  // Guardian management / legacy calls: it is no citizen and names no legacy.
  for (const c of guardianCalls) await rejected(op(outer(SRM, c)), /no CitizenNFT/, world, NO_LEGACY);
  await rejected(op(outer(LEGACY, execLegacy(RECIPIENT, 0n, "0x"))), /legacy account/, world, NO_LEGACY);
  // Driving the recovery to its own key or to someone else's: its key's signer is not the new owner.
  await rejected(op(outer(SRM, multiConfirm())), /submitter's own passkey signer/, world, NO_LEGACY);
  await rejected(op(outer(SRM, executeRecovery())), /submitter's own passkey signer/, world, NO_LEGACY);
  const pending = recoveryWorld((w) =>
    w.recoveryRequests.set(lc(WALLET), { executeAfter: BigInt(NOW - 1), newThreshold: 1n, newOwners: [NEW_SIGNER] }),
  );
  await rejected(op(outer(SRM, finalize())), /submitter's passkey/, pending, NO_LEGACY);
  // Arbitrary calls.
  await rejected(op(outer(RECIPIENT, "0xa9059cbb")), /not allowlisted/, world, NO_LEGACY);
  await rejected(op(outer(ADDRESSES.legacyAccountFactory, createAccount(EOA))), /legacy/, world, NO_LEGACY);
});

test("a citizen Safe's confirmRecovery is billed to itself; with a legacy, to the legacy", async () => {
  await ok(op(outer(SRM, confirm())), recoveryWorld(citizenSafe), NO_LEGACY, SAFE, "safe");
  await ok(op(outer(SRM, confirm())), recoveryWorld(), CTX, LEGACY, "legacy");
});

// =====================================================================
// fail closed / no reads before structure
// =====================================================================

test("recovery and migration shapes fail closed on chain read errors", async () => {
  await assert.rejects(evaluateSponsorPolicy(firstRecoveryOp(), NEW_CTX, brokenChain()), ChainReadError);
  await assert.rejects(evaluateSponsorPolicy(op(outer(SRM, confirm())), NO_LEGACY, brokenChain()), ChainReadError);
  await assert.rejects(
    evaluateSponsorPolicy(op(outer(LEGACY, execLegacy(V3_CITIZEN, 0n, moveTo(SAFE)))), CTX, brokenChain()),
    ChainReadError,
  );
});

test("structural recovery rejections do not touch the chain", async () => {
  const chain = recoveryWorld();
  await rejected(firstRecoveryOp([{ to: SRM, data: multiConfirm(WALLET, [NEW_SIGNER], 2n) }]), /exactly one/, chain, NEW_CTX);
  await rejected(firstRecoveryOp([{ to: SRM, data: multiConfirm() }, { to: SRM, data: guardianCalls[0] }]), /mixed/, chain, NEW_CTX);
  await rejected(
    firstRecoveryOp([{ to: ADDRESSES.signerFactory, data: createSigner(KEY, WEBAUTHN_VERIFIERS) }]),
    /own passkey/,
    chain,
    NEW_CTX,
  );
  assert.deepEqual(chain.reads, []);
});
