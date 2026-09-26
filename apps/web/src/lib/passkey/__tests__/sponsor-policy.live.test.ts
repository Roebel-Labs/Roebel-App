/**
 * Live Gnosis (chain 100) check of the real chain reader + policy. Skipped
 * unless PASSKEY_LIVE_TEST=1 (needs network; read-only).
 * Run: cd apps/web && PASSKEY_LIVE_TEST=1 npx tsx --test src/lib/passkey/__tests__/sponsor-policy.live.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeFunctionData, parseAbi, type Hex } from "viem";
import { createGnosisChainReader } from "../chain-reader";
import { CITIZEN_NFT, evaluateSponsorPolicy, LEGACY_ACCOUNT_PROXY_CODE } from "../sponsor-policy";
import { FALLBACK_HANDLER_SLOT, PASSKEY_SAFE, SAFE_PROXY_RUNTIME_CODE, WEBAUTHN_VERIFIERS } from "../safe-address";
import { KEY } from "./fake-chain";

const skip = process.env.PASSKEY_LIVE_TEST !== "1";
/** A real Safe 1.4.1 (the Attester Safe): right proxy + singleton, but no 4337 fallback handler. */
const ATTESTER_SAFE = "0x3A08c86Efc5ff38CC35d850F1D4d564e497bFDEa" as Hex;
/** Holder of CitizenNFTv2 #1, a thirdweb Account proxy. */
const CITIZEN_LEGACY = "0x90F677dC480e76a127Ec1dCE42263a370e396313" as Hex;

const account = parseAbi([
  "function execute(address target, uint256 value, bytes calldata)",
]);
const safe4337 = parseAbi(["function executeUserOp(address to, uint256 value, bytes data, uint8 operation)"]);

test("live: the reader sees real Gnosis state the way the policy expects", { skip }, async () => {
  const chain = createGnosisChainReader();
  assert.equal((await chain.getCode(ATTESTER_SAFE))?.toLowerCase(), SAFE_PROXY_RUNTIME_CODE.toLowerCase());
  assert.equal(BigInt((await chain.getStorageAt(ATTESTER_SAFE, `0x${"0".repeat(64)}`))!), BigInt(PASSKEY_SAFE.singletonL2));
  assert.notEqual(BigInt((await chain.getStorageAt(ATTESTER_SAFE, FALLBACK_HANDLER_SLOT))!), BigInt(PASSKEY_SAFE.safe4337Module));
  assert.equal(await chain.isModuleEnabled(ATTESTER_SAFE, PASSKEY_SAFE.safe4337Module), false);
  assert.ok((await chain.getOwners(ATTESTER_SAFE)).length > 1);
  assert.deepEqual(await chain.getSharedSignerConfiguration(ATTESTER_SAFE), { x: 0n, y: 0n, verifiers: 0n });
  assert.match(await chain.getWebAuthnSigner(BigInt(KEY.x), BigInt(KEY.y), WEBAUTHN_VERIFIERS), /^0x[0-9a-fA-F]{40}$/);
  assert.equal((await chain.getCode(CITIZEN_LEGACY))?.toLowerCase(), LEGACY_ACCOUNT_PROXY_CODE.toLowerCase());
  assert.ok((await chain.balanceOf(CITIZEN_NFT, CITIZEN_LEGACY)) > 0n);
  assert.equal(await chain.balanceOf(CITIZEN_NFT, ATTESTER_SAFE), 0n);
  assert.equal(await chain.isAdmin(CITIZEN_LEGACY, ATTESTER_SAFE), false);
});

test("live: a garbage handover signature is a REVERT (null), not a transport failure", { skip }, async () => {
  const chain = createGnosisChainReader();
  const now = BigInt(Math.floor(Date.now() / 1000));
  const r = await chain.verifySignerPermissionRequest(
    CITIZEN_LEGACY,
    {
      signer: ATTESTER_SAFE,
      isAdmin: 1,
      approvedTargets: [],
      nativeTokenLimitPerTransaction: 0n,
      permissionStartTimestamp: 0n,
      permissionEndTimestamp: 0n,
      reqValidityStartTimestamp: now - 60n,
      reqValidityEndTimestamp: now + 3600n,
      uid: `0x${"03".repeat(32)}`,
    },
    `0x${"ab".repeat(65)}`,
  );
  assert.ok(r === null || r.success === false);
});

test("live: policy rejects a real non-passkey Safe (403 reason, not a read failure)", { skip }, async () => {
  const chain = createGnosisChainReader();
  const callData = encodeFunctionData({
    abi: safe4337,
    functionName: "executeUserOp",
    args: [CITIZEN_LEGACY, 0n, encodeFunctionData({ abi: account, functionName: "execute", args: [CITIZEN_LEGACY, 0n, "0x"] }), 0],
  });
  const r = await evaluateSponsorPolicy(
    {
      sender: ATTESTER_SAFE,
      nonce: 0n,
      callData,
      callGasLimit: 300_000n,
      verificationGasLimit: 500_000n,
      preVerificationGas: 60_000n,
      maxFeePerGas: 2_000_000_000n,
      maxPriorityFeePerGas: 1_000_000_000n,
      paymasterVerificationGasLimit: 150_000n,
      paymasterPostOpGasLimit: 50_000n,
    },
    { x: KEY.x, y: KEY.y, legacy: CITIZEN_LEGACY, nowSeconds: Math.floor(Date.now() / 1000) },
    chain,
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /fallback handler/);
});
