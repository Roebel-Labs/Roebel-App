/**
 * The expert path: a Safe owned by ONE plain ECDSA key (the account key of the 12 words). The
 * sponsor proves it with the same strictness as the passkey Safe (spec 5.6/5.7): the request names
 * `ecdsaOwner` instead of (x, y), never both, and a proof for one kind of owner never passes the
 * sender check of the other (Review Focus 4).
 * Run: cd apps/web && npx tsx --test src/lib/passkey/__tests__/sponsor-policy-ecdsa.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeFunctionData, getAddress, type Hex } from "viem";
import vector from "./ecdsa-safe-vector.json";
import {
  ADDRESSES,
  evaluateSponsorPolicy,
  parseSponsorRequest,
  type ChainReader,
  type SponsorContext,
  type SponsorUserOp,
} from "../sponsor-policy";
import { EVERYDAY_CONTRACTS as C, citizenNftAbi, hubAbi } from "../everyday-allowlist";
import {
  WEBAUTHN_VERIFIERS,
  buildEcdsaSafeSetup,
  ecdsaSafeFactoryData,
  predictEcdsaSafeAddress,
  safeFactoryData,
} from "../safe-address";
import {
  GUARDIAN,
  KEY,
  LEGACY,
  SAFE,
  fakeChain,
  makeEcdsaSafe,
  makePasskeySafe,
  signerKey,
  type FakeWorld,
} from "./fake-chain";
import { NOW, createSigner, deployOp, execLegacy, op, outer, srm, viaMultiSend } from "./policy-helpers";

const v = { owner: getAddress(vector.owner) as Hex, safeAddress: getAddress(vector.safeAddress) as Hex, setupData: vector.setupData as Hex };
const E: SponsorContext = { ecdsaOwner: v.owner, nowSeconds: NOW };
const ESAFE = v.safeAddress;
const NO_LEGACY: SponsorContext = { ...KEY, nowSeconds: NOW };
const OTHER_EOA = "0x8888888888888888888888888888888888888888" as Hex;
const WALLET = "0x9999999999999999999999999999999999999999" as Hex;
const OTHER_KEY = { x: `0x${"cc".repeat(32)}` as Hex, y: `0x${"dd".repeat(32)}` as Hex };

const add = encodeFunctionData({ abi: srm, functionName: "addGuardianWithThreshold", args: [GUARDIAN, 1n] });
const askCitizen = encodeFunctionData({ abi: citizenNftAbi, functionName: "createAttestationRequest", args: ["Max, Röbel"] });
const personalMint = encodeFunctionData({ abi: hubAbi, functionName: "personalMint" });

async function refused(o: SponsorUserOp, ctx: SponsorContext, chain: ChainReader): Promise<string> {
  const r = await evaluateSponsorPolicy(o, ctx, chain);
  assert.equal(r.ok, false, JSON.stringify(r));
  return r.ok ? "" : r.reason;
}

const hex = (n: bigint) => `0x${n.toString(16)}`;
function toRpc(o: SponsorUserOp): Record<string, string> {
  return {
    sender: o.sender,
    nonce: hex(o.nonce),
    callData: o.callData,
    callGasLimit: hex(o.callGasLimit),
    verificationGasLimit: hex(o.verificationGasLimit),
    preVerificationGas: hex(o.preVerificationGas),
    maxFeePerGas: hex(o.maxFeePerGas),
    maxPriorityFeePerGas: hex(o.maxPriorityFeePerGas),
    paymasterVerificationGasLimit: hex(o.paymasterVerificationGasLimit),
    paymasterPostOpGasLimit: hex(o.paymasterPostOpGasLimit),
  };
}
/** The hex-string userOp a client sends (same shape sponsor-policy.test.ts parses). */
const RAW_OP = toRpc(op(outer(ADDRESSES.socialRecoveryModule, add), { sender: ESAFE }));

/** First op of the expert Safe of `owner`. */
const ecdsaDeploy = (callData: Hex, owner: Hex = v.owner, sender: Hex = ESAFE) => ({
  ...op(callData, { sender }),
  factory: ADDRESSES.safeProxyFactory,
  factoryData: ecdsaSafeFactoryData(owner),
});
const expertWorld = (w: FakeWorld) => makeEcdsaSafe(w, ESAFE, v.owner);

test("ECDSA setup matches the fork vector", () => {
  assert.equal(predictEcdsaSafeAddress(v.owner).toLowerCase(), v.safeAddress.toLowerCase());
  assert.equal(buildEcdsaSafeSetup(v.owner).initializer, v.setupData);
});

test("deploy op of a new expert account asking for citizenship: guest, onboarding tier", async () => {
  const o = ecdsaDeploy(outer(C.citizenNft, askCitizen));
  const r = await evaluateSponsorPolicy(o, E, fakeChain());
  assert.ok(r.ok && r.mode === "everyday" && r.tier === "onboarding" && r.guest === true, JSON.stringify(r));
  assert.equal(r.ok && r.budgetKey.toLowerCase(), ESAFE.toLowerCase());
});

test("deploy op: the sign-up batch (guardian + citizenship request) is one guest op", async () => {
  const o = ecdsaDeploy(viaMultiSend([{ to: ADDRESSES.socialRecoveryModule, data: add }, { to: C.citizenNft, data: askCitizen }]));
  const r = await evaluateSponsorPolicy(o, E, fakeChain());
  assert.ok(r.ok && r.guest === true, JSON.stringify(r));
});

test("deploy op: factoryData and sender must be EXACTLY the expert Safe of ecdsaOwner", async () => {
  // Another owner's deployment under this owner's proof.
  await refused(ecdsaDeploy(outer(C.citizenNft, askCitizen), OTHER_EOA), E, fakeChain());
  // The right deployment, but a different sender.
  await refused(ecdsaDeploy(outer(C.citizenNft, askCitizen), v.owner, predictEcdsaSafeAddress(OTHER_EOA)), E, fakeChain());
  // A passkey Safe deployment under the ECDSA proof, and the expert deployment under a passkey proof.
  await refused(deployOp(KEY, SAFE, outer(C.citizenNft, askCitizen)), E, fakeChain());
  await refused(deployOp(KEY, ESAFE, outer(C.citizenNft, askCitizen)), E, fakeChain());
  await refused(ecdsaDeploy(outer(C.citizenNft, askCitizen)), NO_LEGACY, fakeChain());
  await refused({ ...ecdsaDeploy(outer(C.citizenNft, askCitizen)), factoryData: safeFactoryData(KEY) }, E, fakeChain());
  // A wrong factory.
  await refused({ ...ecdsaDeploy(outer(C.citizenNft, askCitizen)), factory: OTHER_EOA }, E, fakeChain());
});

test("deploy op: an owner that already carries contract code is refused (not an ECDSA key)", async () => {
  const reason = await refused(ecdsaDeploy(outer(C.citizenNft, askCitizen)), E, fakeChain((w) => w.codes.set(v.owner.toLowerCase(), "0x6080")));
  assert.match(reason, /ecdsaOwner is a contract, not a plain key/);
});

test("deployed expert Safe: guardian management passes; a citizen one is not a guest", async () => {
  const world = expertWorld;
  assert.deepEqual(
    await evaluateSponsorPolicy(op(outer(ADDRESSES.socialRecoveryModule, add), { sender: ESAFE }), E, fakeChain(world)),
    { ok: true, mode: "safe", budgetKey: ESAFE, guest: true },
  );
  const citizen = (w: FakeWorld) => {
    world(w);
    w.citizens.add(ESAFE.toLowerCase());
  };
  assert.deepEqual(
    await evaluateSponsorPolicy(op(outer(ADDRESSES.socialRecoveryModule, add), { sender: ESAFE }), E, fakeChain(citizen)),
    { ok: true, mode: "safe", budgetKey: ESAFE },
  );
});

test("deployed expert Safe: everyday onboarding as a guest, citizen tier as a citizen", async () => {
  const guest = await evaluateSponsorPolicy(op(outer(C.circlesHub, personalMint), { sender: ESAFE }), E, fakeChain(expertWorld));
  assert.deepEqual(guest, { ok: true, mode: "everyday", budgetKey: ESAFE, tier: "onboarding", guest: true });
  const citizen = await evaluateSponsorPolicy(
    op(outer(C.circlesHub, personalMint), { sender: ESAFE }),
    E,
    fakeChain((w) => {
      expertWorld(w);
      w.citizens.add(ESAFE.toLowerCase());
    }),
  );
  assert.deepEqual(citizen, { ok: true, mode: "everyday", budgetKey: ESAFE, tier: "citizen" });
});

test("deployed expert Safe: an EIP-7702-delegated owner passes, other owner code does not", async () => {
  const designator = `0xef0100${"12".repeat(20)}` as Hex;
  const with7702 = (code: Hex) => (w: FakeWorld) => {
    expertWorld(w);
    w.codes.set(v.owner.toLowerCase(), code);
  };
  const call = op(outer(ADDRESSES.socialRecoveryModule, add), { sender: ESAFE });
  assert.ok((await evaluateSponsorPolicy(call, E, fakeChain(with7702(designator)))).ok);
  await refused(call, E, fakeChain(with7702(`${designator}00` as Hex))); // designator + 1 byte
  await refused(call, E, fakeChain(with7702(`0xef0100${"12".repeat(19)}` as Hex))); // too short
  await refused(call, E, fakeChain(with7702(`0xef0000${"12".repeat(20)}` as Hex))); // not the 7702 prefix
});

test("the proof must match the sender (Review Focus 4)", async () => {
  // words-owner body for a passkey Safe
  await refused(op(outer(ADDRESSES.socialRecoveryModule, add)), E, fakeChain());
  // passkey body for an expert Safe
  await refused(op(outer(ADDRESSES.socialRecoveryModule, add), { sender: ESAFE }), NO_LEGACY, fakeChain(expertWorld));
  // wrong ECDSA owner
  await refused(op(outer(ADDRESSES.socialRecoveryModule, add), { sender: ESAFE }), { ...E, ecdsaOwner: OTHER_EOA }, fakeChain(expertWorld));
  // a second owner
  await refused(
    op(outer(ADDRESSES.socialRecoveryModule, add), { sender: ESAFE }),
    E,
    fakeChain((w) => {
      expertWorld(w);
      w.owners.set(ESAFE.toLowerCase(), [v.owner, OTHER_EOA]);
    }),
  );
  // a contract owner
  await refused(
    op(outer(ADDRESSES.socialRecoveryModule, add), { sender: ESAFE }),
    E,
    fakeChain((w) => {
      expertWorld(w);
      w.codes.set(v.owner.toLowerCase(), "0x6080");
    }),
  );
  // the expert Safe's own owner, claimed as a passkey whose recovered WebAuthn signer is that address
  await refused(
    op(outer(ADDRESSES.socialRecoveryModule, add), { sender: ESAFE }),
    NO_LEGACY,
    fakeChain((w) => {
      expertWorld(w);
      w.webauthnSigners.set(signerKey(KEY), v.owner);
    }),
  );
  // a passkey Safe whose owner was recovered to a WebAuthn signer, claimed with that signer as ecdsaOwner
  const SIGNER = "0x7777777777777777777777777777777777777777" as Hex;
  await refused(
    op(outer(ADDRESSES.socialRecoveryModule, add)),
    { ...E, ecdsaOwner: SIGNER },
    fakeChain((w) => {
      w.owners.set(SAFE.toLowerCase(), [SIGNER]);
      w.codes.set(SIGNER.toLowerCase(), "0x6080604052");
      w.webauthnSigners.set(signerKey(KEY), SIGNER);
    }),
  );
  // a deployed Safe that is not the sovereign shape (no SocialRecoveryModule)
  await refused(
    op(outer(ADDRESSES.socialRecoveryModule, add), { sender: ESAFE }),
    E,
    fakeChain((w) => {
      expertWorld(w);
      w.modules.delete(`${ESAFE}:${ADDRESSES.socialRecoveryModule}`.toLowerCase());
    }),
  );
});

test("the ECDSA branch never reads the passkey signer factory or the shared signer", async () => {
  const chain = fakeChain(expertWorld);
  assert.ok((await evaluateSponsorPolicy(op(outer(ADDRESSES.socialRecoveryModule, add), { sender: ESAFE }), E, chain)).ok);
  assert.ok(!chain.reads.includes("getWebAuthnSigner") && !chain.reads.includes("getSharedSignerConfiguration"), chain.reads.join(","));
});

test("the policy refuses a context with both proofs, none, or a zero / sentinel owner", async () => {
  const call = op(outer(ADDRESSES.socialRecoveryModule, add), { sender: ESAFE });
  await refused(call, { ...E, ...KEY }, fakeChain(expertWorld));
  await refused(call, { nowSeconds: NOW }, fakeChain(expertWorld));
  await refused(call, { x: KEY.x, nowSeconds: NOW }, fakeChain(expertWorld));
  await refused(call, { ...E, ecdsaOwner: "0x0000000000000000000000000000000000000000" }, fakeChain());
  await refused(call, { ...E, ecdsaOwner: "0x0000000000000000000000000000000000000001" }, fakeChain());
});

// ---- recovery (mode C) with the new phrase as the submitter's key ----

const recoveryWorld = (w: FakeWorld) => {
  makePasskeySafe(w, WALLET, OTHER_KEY);
  w.guardians.set(WALLET.toLowerCase(), new Set([GUARDIAN.toLowerCase()]));
};
const exec = (owner: Hex, wallet: Hex = WALLET) =>
  encodeFunctionData({ abi: srm, functionName: "executeRecovery", args: [wallet, [owner], 1n] });

test("recovery to a new phrase: newOwners must be the submitter's ECDSA owner; createSigner is refused", async () => {
  const world = recoveryWorld;
  const deploy = (data: Hex) => ecdsaDeploy(outer(ADDRESSES.socialRecoveryModule, data));
  assert.deepEqual(await evaluateSponsorPolicy(deploy(exec(v.owner)), E, fakeChain(world)), {
    ok: true,
    mode: "recovery",
    budgetKey: ESAFE,
    guest: true,
  });
  await refused(deploy(exec(OTHER_EOA)), E, fakeChain(world));
  const reason = await refused(
    {
      ...deploy(exec(v.owner)),
      callData: viaMultiSend([
        { to: ADDRESSES.signerFactory, data: createSigner(KEY, WEBAUTHN_VERIFIERS) },
        { to: ADDRESSES.socialRecoveryModule, data: exec(v.owner) },
      ]),
    },
    E,
    fakeChain(world),
  );
  assert.match(reason, /expert-path Safe cannot create a passkey signer/);
  // Even createSigner(0, 0, verifiers) - the zeroed scan coordinates - is refused.
  await refused(
    { ...deploy(exec(v.owner)), callData: outer(ADDRESSES.signerFactory, createSigner({ x: "0x00", y: "0x00" }, WEBAUTHN_VERIFIERS)) },
    E,
    fakeChain(world),
  );
});

test("recovery: multiConfirmRecovery must also name the ECDSA owner", async () => {
  const multi = (owner: Hex) =>
    encodeFunctionData({
      abi: srm,
      functionName: "multiConfirmRecovery",
      args: [WALLET, [owner], 1n, [{ signer: GUARDIAN, signature: "0x01" }], false],
    });
  assert.ok((await evaluateSponsorPolicy(op(outer(ADDRESSES.socialRecoveryModule, multi(v.owner)), { sender: ESAFE }), E, fakeChain((w) => {
    recoveryWorld(w);
    expertWorld(w);
  }))).ok);
  await refused(op(outer(ADDRESSES.socialRecoveryModule, multi(OTHER_EOA)), { sender: ESAFE }), E, fakeChain((w) => {
    recoveryWorld(w);
    expertWorld(w);
  }));
});

test("recovery: finalizeRecovery only when the pending owners are [ecdsaOwner] and the delay is over", async () => {
  const finalize = encodeFunctionData({ abi: srm, functionName: "finalizeRecovery", args: [WALLET] });
  const pending = (owners: Hex[], executeAfter = BigInt(NOW - 1)) => (w: FakeWorld) => {
    recoveryWorld(w);
    expertWorld(w);
    w.recoveryRequests.set(WALLET.toLowerCase(), { executeAfter, newThreshold: 1n, newOwners: owners });
  };
  const call = op(outer(ADDRESSES.socialRecoveryModule, finalize), { sender: ESAFE });
  assert.ok((await evaluateSponsorPolicy(call, E, fakeChain(pending([v.owner])))).ok);
  await refused(call, E, fakeChain(pending([OTHER_EOA])));
  await refused(call, E, fakeChain(pending([v.owner], BigInt(NOW + 3600))));
  // A passkey submitter cannot finalize a recovery that hands the wallet to an ECDSA owner.
  await refused(op(outer(ADDRESSES.socialRecoveryModule, finalize)), NO_LEGACY, fakeChain(pending([v.owner])));
});

test("recovery: an expert Safe is itself recoverable (as a guest wallet) by a passkey submitter", async () => {
  const RECOVERED = "0x7777777777777777777777777777777777777777" as Hex;
  const world = (w: FakeWorld) => {
    expertWorld(w);
    w.guardians.set(ESAFE.toLowerCase(), new Set([GUARDIAN.toLowerCase()]));
    w.webauthnSigners.set(signerKey(KEY), RECOVERED);
  };
  const r = await evaluateSponsorPolicy(op(outer(ADDRESSES.socialRecoveryModule, exec(RECOVERED, ESAFE))), NO_LEGACY, fakeChain(world));
  assert.deepEqual(r, { ok: true, mode: "recovery", budgetKey: SAFE, guest: true });
});

test("legacy and ecdsaOwner together are refused; a body with both proofs or none is a bad request", async () => {
  const reason = await refused(
    op(outer(LEGACY, execLegacy(C.circlesHub, 0n, personalMint)), { sender: ESAFE }),
    { ...E, legacy: LEGACY },
    fakeChain(expertWorld),
  );
  assert.match(reason, /an expert-path Safe cannot drive a legacy account/);
  assert.throws(() => parseSponsorRequest({ chainId: 100, userOp: RAW_OP, x: KEY.x, y: KEY.y, ecdsaOwner: v.owner }));
  assert.throws(() => parseSponsorRequest({ chainId: 100, userOp: RAW_OP }));
  assert.throws(() => parseSponsorRequest({ chainId: 100, userOp: RAW_OP, x: KEY.x, ecdsaOwner: v.owner }));
  assert.throws(() => parseSponsorRequest({ chainId: 100, userOp: RAW_OP, ecdsaOwner: "0x1234" }));
  const parsed = parseSponsorRequest({ chainId: 100, userOp: RAW_OP, ecdsaOwner: v.owner });
  assert.equal(parsed.ecdsaOwner, v.owner);
  assert.equal(parsed.x, undefined);
  assert.equal(parsed.y, undefined);
  const passkey = parseSponsorRequest({ chainId: 100, userOp: RAW_OP, x: KEY.x, y: KEY.y });
  assert.equal(passkey.ecdsaOwner, undefined);
  assert.equal(passkey.x, KEY.x);
});
