/**
 * "E-Mail oder Google als Helfer" (Expo lib/passkey/recovery-helper.ts): the passkey Safe adds a
 * thirdweb smart account as a guardian with ONE sponsored op,
 * SRM.addGuardianWithThreshold(helper, t). This pins that the existing policy sponsors exactly
 * that shape for a citizen identity (legacy or Safe), and still refuses it for a non-citizen.
 * The helper's own confirmRecovery on a new phone is a thirdweb smart-account transaction
 * (thirdweb's sponsorship), so it never reaches this policy.
 * Run: cd apps/web && npx tsx --test src/lib/passkey/__tests__/sponsor-policy-recovery-helper.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeFunctionData, type Hex } from "viem";
import { ADDRESSES, evaluateSponsorPolicy, type SponsorContext } from "../sponsor-policy";
import { KEY, LEGACY, SAFE, V3_ATTESTER, V3_CITIZEN, fakeChain, type FakeWorld } from "./fake-chain";
import { NOW, op, outer, srm } from "./policy-helpers";

/** A counterfactual thirdweb smart account (the helper): no code, no NFT, no profile. */
const HELPER = "0x8888888888888888888888888888888888888888" as Hex;
const SRM = ADDRESSES.socialRecoveryModule;
const V3 = { citizenNft: V3_CITIZEN, attesterNft: V3_ATTESTER };
const LEGACY_CTX: SponsorContext = { x: KEY.x, y: KEY.y, legacy: LEGACY, nowSeconds: NOW, v3: V3 };
const SAFE_CTX: SponsorContext = { x: KEY.x, y: KEY.y, nowSeconds: NOW, v3: V3 };
const lc = (a: string) => a.toLowerCase();

const addHelper = (threshold: bigint) =>
  op(outer(SRM, encodeFunctionData({ abi: srm, functionName: "addGuardianWithThreshold", args: [HELPER, threshold] })));

test("migrated citizen (legacy identity): adding the helper as the only guardian (threshold 1) is sponsored", async () => {
  const r = await evaluateSponsorPolicy(addHelper(1n), LEGACY_CTX, fakeChain());
  assert.equal(r.ok, true, r.ok ? "" : r.reason);
  if (r.ok) {
    assert.equal(r.mode, "legacy");
    assert.equal(lc(r.budgetKey), lc(LEGACY));
  }
});

test("migrated citizen: adding the helper while keeping a higher threshold is sponsored", async () => {
  const r = await evaluateSponsorPolicy(addHelper(2n), LEGACY_CTX, fakeChain());
  assert.equal(r.ok, true, r.ok ? "" : r.reason);
});

test("citizen Safe (after the v3 move): adding the helper is sponsored in mode safe", async () => {
  const r = await evaluateSponsorPolicy(addHelper(1n), SAFE_CTX, fakeChain((w: FakeWorld) => w.citizensV3.add(lc(SAFE))));
  assert.equal(r.ok, true, r.ok ? "" : r.reason);
  if (r.ok) {
    assert.equal(r.mode, "safe");
    assert.equal(lc(r.budgetKey), lc(SAFE));
  }
});

test("a Safe that is not admin of the named legacy account cannot add a helper", async () => {
  const r = await evaluateSponsorPolicy(
    addHelper(1n),
    LEGACY_CTX,
    fakeChain((w) => w.admins.delete(lc(`${LEGACY}:${SAFE}`))),
  );
  assert.equal(r.ok, false);
});

test("a passkey-only Safe without citizenship gets no sponsored helper add (the app hides the action)", async () => {
  const r = await evaluateSponsorPolicy(addHelper(1n), SAFE_CTX, fakeChain());
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /no CitizenNFT/);
});
