/**
 * Sponsor mode "everyday": a verified passkey Safe sends citizen actions, as its
 * legacy thirdweb account (legacy.execute / executeBatch) or as itself.
 * Run: cd apps/web && npx tsx --test src/lib/passkey/__tests__/everyday-policy.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeFunctionData, type Hex } from "viem";
import { evaluateSponsorPolicy, parseSponsorRequest, type ChainReader, type SponsorContext, type SponsorUserOp } from "../sponsor-policy";
import {
  EVERYDAY_CONTRACTS as C,
  EVERYDAY_SELECTORS,
  attesterNftAbi,
  citizenNftAbi,
  classifyEverydayCall,
  hubAbi,
  maciAbi,
  nameRegistryAbi,
  pollAbi,
} from "../everyday-allowlist";
import { CONTRACTS } from "../../../../../../packages/blockchain/src/index";
import { predictSafeAddress } from "../safe-address";
import { KEY, LEGACY, OTHER_LEGACY, RECIPIENT, SAFE, brokenChain, fakeChain, type FakeWorld } from "./fake-chain";
import { NOW, account, deployOp, execLegacy, handover, op, outer, viaMultiSend } from "./policy-helpers";

const CTX: SponsorContext = { ...KEY, legacy: LEGACY, nowSeconds: NOW };
const NO_LEGACY: SponsorContext = { ...KEY, nowSeconds: NOW };
const POLL = "0x87E11b3Ba84ED44B7D42014c6AD184D65A342699" as Hex;
const lc = (a: string) => a.toLowerCase();

// ---- calldata ----
const personalMint = encodeFunctionData({ abi: hubAbi, functionName: "personalMint" });
const groupMint = (group: Hex = C.roebelGroup) =>
  encodeFunctionData({ abi: hubAbi, functionName: "groupMint", args: [group, [LEGACY], [5n], "0x"] });
const trust = encodeFunctionData({ abi: hubAbi, functionName: "trust", args: [RECIPIENT, 4102444800n] });
const registerHuman = encodeFunctionData({ abi: hubAbi, functionName: "registerHuman", args: [RECIPIENT, `0x${"00".repeat(32)}`] });
const send = (from: Hex, id: bigint = BigInt(C.roebelGroup)) =>
  encodeFunctionData({ abi: hubAbi, functionName: "safeTransferFrom", args: [from, RECIPIENT, id, 10n ** 18n, "0x"] });
const metadata = encodeFunctionData({ abi: nameRegistryAbi, functionName: "updateMetadataDigest", args: [`0x${"12".repeat(32)}`] });
const askCitizen = encodeFunctionData({ abi: citizenNftAbi, functionName: "createAttestationRequest", args: ["Max, Röbel"] });
const approveCitizen = encodeFunctionData({ abi: citizenNftAbi, functionName: "approveRequest", args: [7n, true] });
const rejectCitizen = encodeFunctionData({ abi: citizenNftAbi, functionName: "rejectRequest", args: [7n, false] });
const revokeCitizen = encodeFunctionData({ abi: citizenNftAbi, functionName: "createRevocationRequest", args: [RECIPIENT, "weggezogen"] });
const askAttester = encodeFunctionData({ abi: attesterNftAbi, functionName: "createAttestationRequest", args: ["x"] });
const approveAttester = encodeFunctionData({ abi: attesterNftAbi, functionName: "approveRequest", args: [3n] });
const rejectAttester = encodeFunctionData({ abi: attesterNftAbi, functionName: "rejectRequest", args: [3n] });
const signUp = encodeFunctionData({ abi: maciAbi, functionName: "signUp", args: [{ x: 1n, y: 2n }, "0x01", "0x"] });
const vote = encodeFunctionData({
  abi: pollAbi,
  functionName: "publishMessage",
  args: [{ data: [1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n, 10n] }, { x: 3n, y: 4n }],
});

const withPoll = (mutate?: (w: FakeWorld) => void) =>
  fakeChain((w) => {
    w.polls.set("2", POLL);
    mutate?.(w);
  });
const citizenSafe = (w: FakeWorld) => w.citizens.add(lc(SAFE));

async function ok(o: SponsorUserOp, chain: ChainReader, ctx: SponsorContext, budgetKey: Hex, tier = "citizen") {
  const r = await evaluateSponsorPolicy(o, ctx, chain);
  assert.equal(r.ok, true, r.ok ? "" : `expected ok, got: ${r.reason}`);
  if (r.ok) {
    assert.equal(r.mode, "everyday");
    assert.equal(r.budgetKey.toLowerCase(), budgetKey.toLowerCase());
    assert.equal(r.tier, tier);
  }
}
async function rejected(o: SponsorUserOp, re: RegExp, chain: ChainReader, ctx: SponsorContext) {
  const r = await evaluateSponsorPolicy(o, ctx, chain);
  assert.equal(r.ok, false, "expected rejection");
  if (!r.ok) assert.match(r.reason, re);
}

// =====================================================================
// allowlist table
// =====================================================================

test("allowlist addresses match packages/blockchain (source of truth)", () => {
  assert.equal(lc(C.citizenNft), lc(CONTRACTS.citizenNFT));
  assert.equal(lc(C.attesterNft), lc(CONTRACTS.attesterNFT));
  assert.equal(lc(C.maci), lc(CONTRACTS.maci));
});

test("every documented selector is what the ABIs encode", () => {
  const sel = (d: Hex) => d.slice(0, 10);
  assert.equal(sel(personalMint), EVERYDAY_SELECTORS["Hub.personalMint()"]);
  assert.equal(sel(groupMint()), EVERYDAY_SELECTORS["Hub.groupMint(address,address[],uint256[],bytes)"]);
  assert.equal(sel(trust), EVERYDAY_SELECTORS["Hub.trust(address,uint96)"]);
  assert.equal(sel(registerHuman), EVERYDAY_SELECTORS["Hub.registerHuman(address,bytes32)"]);
  assert.equal(sel(send(LEGACY)), EVERYDAY_SELECTORS["Hub.safeTransferFrom(address,address,uint256,uint256,bytes)"]);
  assert.equal(sel(metadata), EVERYDAY_SELECTORS["NameRegistry.updateMetadataDigest(bytes32)"]);
  assert.equal(sel(askCitizen), EVERYDAY_SELECTORS["CitizenNFTv2.createAttestationRequest(string)"]);
  assert.equal(sel(revokeCitizen), EVERYDAY_SELECTORS["CitizenNFTv2.createRevocationRequest(address,string)"]);
  assert.equal(sel(approveCitizen), EVERYDAY_SELECTORS["CitizenNFTv2.approveRequest(uint256,bool)"]);
  assert.equal(sel(rejectCitizen), EVERYDAY_SELECTORS["CitizenNFTv2.rejectRequest(uint256,bool)"]);
  assert.equal(sel(approveAttester), EVERYDAY_SELECTORS["AttesterNFTv2.approveRequest(uint256)"]);
  assert.equal(sel(rejectAttester), EVERYDAY_SELECTORS["AttesterNFTv2.rejectRequest(uint256)"]);
  assert.equal(sel(signUp), EVERYDAY_SELECTORS["MACI.signUp((uint256,uint256),bytes,bytes)"]);
  assert.equal(sel(vote), EVERYDAY_SELECTORS["Poll.publishMessage((uint256[10]),(uint256,uint256))"]);
});

test("classify: argument rules and value", () => {
  assert.equal(classifyEverydayCall(C.circlesHub, 0n, personalMint, LEGACY).ok, true);
  assert.equal(classifyEverydayCall(C.circlesHub, 1n, personalMint, LEGACY).ok, false);
  assert.equal(classifyEverydayCall(C.circlesHub, 0n, groupMint(RECIPIENT), LEGACY).ok, false);
  assert.equal(classifyEverydayCall(C.circlesHub, 0n, send(LEGACY), LEGACY).ok, true);
  assert.equal(classifyEverydayCall(C.circlesHub, 0n, send(OTHER_LEGACY), LEGACY).ok, false);
  assert.equal(classifyEverydayCall(C.circlesHub, 0n, send(LEGACY, BigInt(LEGACY)), LEGACY).ok, false);
  // Selectors valid elsewhere are not valid on another target.
  assert.equal(classifyEverydayCall(C.attesterNft, 0n, approveCitizen, LEGACY).ok, false);
  assert.equal(classifyEverydayCall(C.citizenNft, 0n, approveAttester, LEGACY).ok, false);
  assert.equal(classifyEverydayCall(C.roebelGroup, 0n, personalMint, LEGACY).ok, false);
  const ask = classifyEverydayCall(C.citizenNft, 0n, askCitizen, SAFE);
  assert.ok(ask.ok && ask.tier === "onboarding");
  const askA = classifyEverydayCall(C.attesterNft, 0n, askAttester, SAFE);
  assert.ok(askA.ok && askA.tier === "citizen");
});

// =====================================================================
// identity = legacy thirdweb account
// =====================================================================

test("legacy identity: every allowlisted action through legacy.execute", async () => {
  const chain = withPoll();
  const ctx = { ...CTX, pollId: 2n };
  for (const [to, data] of [
    [C.circlesHub, personalMint],
    [C.circlesHub, groupMint()],
    [C.circlesHub, trust],
    [C.circlesHub, registerHuman],
    [C.circlesHub, send(LEGACY)],
    [C.circlesNameRegistry, metadata],
    [C.citizenNft, revokeCitizen],
    [C.citizenNft, approveCitizen],
    [C.citizenNft, rejectCitizen],
    [C.attesterNft, askAttester],
    [C.attesterNft, approveAttester],
    [C.attesterNft, rejectAttester],
    [C.maci, signUp],
    [POLL, vote],
  ] as Array<[Hex, Hex]>) {
    await ok(op(outer(LEGACY, execLegacy(to, 0n, data))), chain, ctx, LEGACY);
  }
});

test("legacy identity: executeBatch (mint + group mint) and a multiSend of executes", async () => {
  const batch = encodeFunctionData({
    abi: account,
    functionName: "executeBatch",
    args: [[C.circlesHub, C.circlesHub], [0n, 0n], [personalMint, groupMint()]],
  });
  await ok(op(outer(LEGACY, batch)), fakeChain(), CTX, LEGACY);
  await ok(
    op(viaMultiSend([{ to: LEGACY, data: execLegacy(C.maci, 0n, signUp) }, { to: LEGACY, data: execLegacy(POLL, 0n, vote) }])),
    withPoll(),
    { ...CTX, pollId: 2n },
    LEGACY,
  );
});

test("legacy identity: value, unknown targets and foreign balances are refused", async () => {
  const chain = fakeChain();
  await rejected(op(outer(LEGACY, execLegacy(C.circlesHub, 1n, personalMint))), /value 0/, chain, CTX);
  await rejected(op(outer(LEGACY, execLegacy(RECIPIENT, 0n, "0xa9059cbb"))), /not allowlisted/, chain, CTX);
  await rejected(op(outer(LEGACY, execLegacy(RECIPIENT, 1n, "0x"))), /selector/, chain, CTX);
  await rejected(op(outer(LEGACY, execLegacy(C.circlesHub, 0n, send(SAFE)))), /own balance/, chain, CTX);
  const batch = encodeFunctionData({
    abi: account,
    functionName: "executeBatch",
    args: [[C.circlesHub, C.circlesHub], [0n, 1n], [personalMint, personalMint]],
  });
  await rejected(op(outer(LEGACY, batch)), /value 0/, chain, CTX);
});

test("legacy identity: sender must be an admin, the legacy a citizen thirdweb account", async () => {
  const call = op(outer(LEGACY, execLegacy(C.circlesHub, 0n, personalMint)));
  await rejected(call, /not an admin/, fakeChain((w) => w.admins.delete(lc(`${LEGACY}:${SAFE}`))), CTX);
  await rejected(call, /no CitizenNFT/, fakeChain((w) => w.citizens.delete(lc(LEGACY))), CTX);
  await rejected(call, /not a legacy thirdweb account/, fakeChain((w) => w.codes.set(lc(LEGACY), "0x6080")), CTX);
  // The non-citizen onboarding tier is for passkey-only Safes, not for a legacy account.
  await rejected(
    op(outer(LEGACY, execLegacy(C.citizenNft, 0n, askCitizen))),
    /no CitizenNFT/,
    fakeChain((w) => w.citizens.delete(lc(LEGACY))),
    CTX,
  );
});

test("legacy identity: a Poll vote needs pollId with MACI.polls(pollId) == target", async () => {
  const call = op(outer(LEGACY, execLegacy(POLL, 0n, vote)));
  await rejected(call, /pollId/, withPoll(), CTX);
  await rejected(call, /not the MACI poll/, withPoll(), { ...CTX, pollId: 3n });
  await rejected(op(outer(LEGACY, execLegacy(RECIPIENT, 0n, vote))), /not the MACI poll/, withPoll(), { ...CTX, pollId: 2n });
  // Two different poll targets in one op cannot both match one pollId.
  await rejected(
    op(viaMultiSend([{ to: LEGACY, data: execLegacy(POLL, 0n, vote) }, { to: LEGACY, data: execLegacy(RECIPIENT, 0n, vote) }])),
    /not the MACI poll/,
    withPoll(),
    { ...CTX, pollId: 2n },
  );
});

test("legacy identity: a direct call from the Safe (wrong msg.sender) is refused", async () => {
  await rejected(op(outer(C.circlesHub, personalMint)), /through legacy.execute/, fakeChain(), CTX);
});

test("migration shapes plus everyday actions stay mode legacy (handover first)", async () => {
  const r = await evaluateSponsorPolicy(
    op(viaMultiSend([{ to: LEGACY, data: handover() }, { to: LEGACY, data: execLegacy(C.circlesHub, 0n, personalMint) }])),
    CTX,
    fakeChain((w) => w.admins.delete(lc(`${LEGACY}:${SAFE}`))),
  );
  assert.ok(r.ok && r.mode === "legacy", JSON.stringify(r));
});

// =====================================================================
// identity = the passkey Safe itself
// =====================================================================

test("Safe identity (citizen): direct allowlisted calls, single and batched", async () => {
  const chain = withPoll(citizenSafe);
  await ok(op(outer(C.circlesHub, personalMint)), chain, NO_LEGACY, SAFE);
  await ok(op(outer(C.circlesHub, send(SAFE))), chain, NO_LEGACY, SAFE);
  await ok(op(viaMultiSend([{ to: C.maci, data: signUp }, { to: POLL, data: vote }])), chain, { ...NO_LEGACY, pollId: 2n }, SAFE);
  await rejected(op(outer(C.circlesHub, send(LEGACY))), /own balance/, chain, NO_LEGACY);
});

test("Safe identity (non-citizen): only createAttestationRequest, onboarding tier", async () => {
  await ok(op(outer(C.citizenNft, askCitizen)), fakeChain(), NO_LEGACY, SAFE, "onboarding");
  // A brand-new Safe: deploy + ask in one op.
  const fresh = { x: `0x${"aa".repeat(32)}` as Hex, y: `0x${"bb".repeat(32)}` as Hex };
  const freshSafe = predictSafeAddress(fresh);
  const r = await evaluateSponsorPolicy(
    deployOp(fresh, freshSafe, outer(C.citizenNft, askCitizen)),
    { ...fresh, nowSeconds: NOW },
    fakeChain(),
  );
  assert.ok(r.ok && r.mode === "everyday" && r.tier === "onboarding", JSON.stringify(r));
  for (const data of [personalMint, trust, registerHuman]) {
    await rejected(op(outer(C.circlesHub, data)), /citizen/, fakeChain(), NO_LEGACY);
  }
  await rejected(op(outer(C.maci, signUp)), /citizen/, fakeChain(), NO_LEGACY);
  // Onboarding + citizen action in one op = needs citizenship.
  await rejected(op(viaMultiSend([{ to: C.citizenNft, data: askCitizen }, { to: C.circlesHub, data: personalMint }])), /citizen/, fakeChain(), NO_LEGACY);
});

test("Safe identity: sender must be the genuine passkey Safe for (x, y)", async () => {
  const other = { x: `0x${"aa".repeat(32)}` as Hex, y: `0x${"bb".repeat(32)}` as Hex };
  await rejected(op(outer(C.citizenNft, askCitizen)), /shared signer/, fakeChain(), { ...other, nowSeconds: NOW });
  await rejected(op(outer(C.citizenNft, askCitizen), { sender: RECIPIENT }), /not a passkey Safe/, fakeChain(), NO_LEGACY);
});

test("everyday calls never mix with recovery calls", async () => {
  const srmFinalize = encodeFunctionData({
    abi: [{ type: "function", name: "finalizeRecovery", inputs: [{ name: "wallet", type: "address" }], outputs: [], stateMutability: "nonpayable" }],
    functionName: "finalizeRecovery",
    args: [RECIPIENT],
  });
  const { ADDRESSES } = await import("../sponsor-policy");
  await rejected(
    op(viaMultiSend([{ to: C.circlesHub, data: personalMint }, { to: ADDRESSES.socialRecoveryModule, data: srmFinalize }])),
    /mixed/,
    fakeChain(citizenSafe),
    NO_LEGACY,
  );
});

test("everyday fails closed on chain read errors", async () => {
  await assert.rejects(evaluateSponsorPolicy(op(outer(C.circlesHub, personalMint)), NO_LEGACY, brokenChain()));
  await assert.rejects(evaluateSponsorPolicy(op(outer(LEGACY, execLegacy(C.circlesHub, 0n, personalMint))), CTX, brokenChain()));
});

test("structural everyday rejections do not touch the chain", async () => {
  const chain = fakeChain();
  await rejected(op(outer(LEGACY, execLegacy(C.circlesHub, 1n, personalMint))), /value 0/, chain, CTX);
  await rejected(op(outer(C.circlesHub, groupMint(RECIPIENT))), /Röbel group/, chain, NO_LEGACY);
  assert.deepEqual(chain.reads, []);
});

test("parseSponsorRequest reads the optional pollId", () => {
  const base = {
    chainId: 100,
    x: KEY.x,
    y: KEY.y,
    userOp: {
      sender: SAFE, nonce: "0x0", callData: "0x", callGasLimit: "0x1", verificationGasLimit: "0x1", preVerificationGas: "0x1",
      maxFeePerGas: "0x1", maxPriorityFeePerGas: "0x1", paymasterVerificationGasLimit: "0x1", paymasterPostOpGasLimit: "0x1",
    },
  };
  assert.equal(parseSponsorRequest({ ...base, pollId: "0x2" }).pollId, 2n);
  assert.equal(parseSponsorRequest(base).pollId, undefined);
  assert.throws(() => parseSponsorRequest({ ...base, pollId: 2 }));
});
