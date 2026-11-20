/**
 * Golden vector: the web device-session builders must reproduce the fork proof byte for byte
 * (contracts/passkey-accounts/test/fixtures/session-keys-vector.json, copied here unchanged).
 * Run: cd apps/web && npx tsx --test src/lib/passkey/__tests__/session-keys-builders.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { type Address, type Hex } from "viem";
import { getUserOperationHash } from "viem/account-abstraction";
import { privateKeyToAccount, sign } from "viem/accounts";
import vector from "./session-keys-vector.json";
import {
  CIRCLES_HUB,
  DEVICE_SESSION_MAX_SEC,
  EXEC_BATCH,
  EXEC_SINGLE,
  MULTI_SEND_CALL_ONLY,
  OWNABLE_VALIDATOR,
  ROEBEL_GROUP,
  SAFE7579,
  SAFE_4337_MODULE,
  SESSION_DAYS,
  SESSION_NONCE_KEY,
  SESSION_RENEW_BEFORE_SEC,
  SESSION_SALTS,
  SMART_SESSIONS,
  TIME_FRAME_POLICY,
  UNI_ACTION_POLICY,
  encode7579Execute,
  encodeSessionSignature,
  grantCallData,
  groupMintData,
  migrationCallData,
  mintSessions,
  permissionIdsOf,
  personalMintData,
  prev4337AfterEnable,
  revokeCallData,
  rootClaimCallData,
  sessionClaimCallData,
  smartSessionInitData,
} from "../session-keys-builders";

const lc = (h: string) => h.toLowerCase();
const inputs = {
  safe: vector.inputs.safe as Address,
  legacy: vector.inputs.legacy as Address,
  signer: vector.inputs.signer as Address,
  validUntil: Number(vector.inputs.validUntil),
};
const pids = vector.permissionIds as { personalMint: Hex; groupMint: Hex };
const groupAmount = BigInt(vector.groupMintAmount);

test("addresses equal the vector", () => {
  assert.equal(lc(SAFE7579), vector.addresses.safe7579);
  assert.equal(lc(SMART_SESSIONS), vector.addresses.smartSessions);
  assert.equal(lc(OWNABLE_VALIDATOR), vector.addresses.ownableValidator);
  assert.equal(lc(UNI_ACTION_POLICY), vector.addresses.uniActionPolicy);
  assert.equal(lc(TIME_FRAME_POLICY), vector.addresses.timeFramePolicy);
  assert.equal(lc(MULTI_SEND_CALL_ONLY), vector.addresses.multiSendCallOnly);
  assert.equal(lc(SAFE_4337_MODULE), vector.addresses.safe4337Module);
  assert.equal(lc(CIRCLES_HUB), vector.addresses.hub);
  assert.equal(lc(ROEBEL_GROUP), vector.addresses.roebelGroup);
});

test("session constants", () => {
  assert.equal(SESSION_DAYS, 30);
  assert.equal(SESSION_RENEW_BEFORE_SEC, 259_200);
  assert.equal(DEVICE_SESSION_MAX_SEC, 30 * 86_400 + 600);
  assert.equal(SESSION_SALTS.personalMint, vector.salts.personalMint);
  assert.equal(SESSION_SALTS.groupMint, vector.salts.groupMint);
});

test("SESSION_NONCE_KEY equals the vector", () => {
  assert.equal(SESSION_NONCE_KEY, BigInt(vector.sessionNonceKey));
  assert.equal(SESSION_NONCE_KEY << 64n, BigInt(vector.sessionOp.nonce));
});

test("mintSessions returns exactly two sessions (personalMint, groupMint)", () => {
  const s = mintSessions(inputs);
  assert.equal(s.length, 2);
  assert.equal(s[0].salt, SESSION_SALTS.personalMint);
  assert.equal(s[1].salt, SESSION_SALTS.groupMint);
  for (const x of s) {
    assert.equal(x.permitERC4337Paymaster, true);
    assert.equal(x.actions.length, 1);
    assert.equal(x.actions[0].actionTargetSelector, "0xb61d27f6");
  }
});

test("permissionIdsOf matches SmartSession.getPermissionId", () => {
  assert.deepEqual(permissionIdsOf(inputs), pids);
});

test("smartSessionInitData reproduces the fork bytes", () => {
  assert.equal(smartSessionInitData(inputs), vector.smartSessionInitData);
});

test("prev4337AfterEnable: 4337 first -> SAFE7579, else the module before it", () => {
  assert.equal(lc(prev4337AfterEnable(vector.inputs.modulesBefore as Address[])), vector.inputs.prev4337);
  assert.equal(prev4337AfterEnable([SAFE_4337_MODULE, vector.inputs.prev4337 as Address]), SAFE7579);
  assert.throws(() => prev4337AfterEnable([vector.inputs.prev4337 as Address]), /Safe4337Module/);
});

test("migrationCallData reproduces the fork batch byte for byte", () => {
  const prev4337 = prev4337AfterEnable(vector.inputs.modulesBefore as Address[]);
  assert.equal(migrationCallData({ ...inputs, prev4337 }), vector.migrationCallData);
});

test("grantCallData replace=false is EXEC_SINGLE self.installModule", () => {
  const cd = grantCallData({ ...inputs, replace: false });
  assert.equal(cd, vector.grantInstallCallData);
  assert.equal(cd.slice(10, 12), "00");
});

test('grantCallData replace=true is uninstall(SENTINEL,"") + install', () => {
  const cd = grantCallData({ ...inputs, replace: true });
  assert.equal(cd, vector.grantReplaceCallData);
  assert.equal(cd.slice(10, 12), "01");
});

test("revokeCallData: EXEC_BATCH for both pids, EXEC_SINGLE for one", () => {
  assert.equal(revokeCallData([pids.personalMint, pids.groupMint]), vector.revokeCallData);
  const single = revokeCallData([pids.personalMint]);
  assert.equal(single.slice(10, 12), "00");
  // packed: SmartSession ++ uint256 0 ++ removeSession(pid)
  assert.ok(single.includes(`${SMART_SESSIONS.slice(2).toLowerCase()}${"0".repeat(64)}`));
  assert.ok(single.includes(pids.personalMint.slice(2)));
});

test("sessionClaimCallData personalMint reproduces the vector", () => {
  assert.equal(sessionClaimCallData(inputs.legacy, personalMintData()), vector.personalMintSessionCallData);
});

test("sessionClaimCallData groupMint reproduces the vector", () => {
  assert.equal(
    sessionClaimCallData(inputs.legacy, groupMintData(inputs.legacy, groupAmount)),
    vector.groupMintSessionCallData,
  );
});

test("rootClaimCallData is EXEC_SINGLE legacy.executeBatch(personalMint, groupMint)", () => {
  assert.equal(rootClaimCallData(inputs.legacy, groupAmount), vector.rootClaimCallData);
  assert.equal(vector.rootOp.callData, vector.rootClaimCallData);
});

test("encode7579Execute never emits callType 0xff", () => {
  const call = { to: inputs.safe, data: "0x" as Hex };
  for (const n of [1, 2, 5]) {
    const cd = encode7579Execute(Array.from({ length: n }, () => call));
    const mode = `0x${cd.slice(10, 74)}`;
    assert.ok(mode === EXEC_SINGLE || mode === EXEC_BATCH, `mode ${mode}`);
    assert.notEqual(cd.slice(10, 12), "ff");
  }
  assert.throws(() => encode7579Execute([]));
});

test("session op: userOpHash, ECDSA and encodeSessionSignature match the vector", async () => {
  const op = vector.sessionOp;
  assert.equal(op.callData, vector.personalMintSessionCallData);
  const pmd = op.paymasterAndData as Hex;
  const userOpHash = getUserOperationHash({
    chainId: Number(vector.chainId),
    entryPointAddress: vector.entryPoint as Address,
    entryPointVersion: "0.7",
    userOperation: {
      sender: op.sender as Address,
      nonce: BigInt(op.nonce),
      callData: op.callData as Hex,
      callGasLimit: BigInt(op.callGasLimit),
      verificationGasLimit: BigInt(op.verificationGasLimit),
      preVerificationGas: BigInt(op.preVerificationGas),
      maxFeePerGas: BigInt(op.maxFeePerGas),
      maxPriorityFeePerGas: BigInt(op.maxPriorityFeePerGas),
      paymaster: `0x${pmd.slice(2, 42)}` as Address,
      paymasterVerificationGasLimit: BigInt(`0x${pmd.slice(42, 74)}`),
      paymasterPostOpGasLimit: BigInt(`0x${pmd.slice(74, 106)}`),
      paymasterData: `0x${pmd.slice(106)}` as Hex,
      signature: "0x",
    },
  });
  assert.equal(userOpHash, op.userOpHash);

  const pk = vector.inputs.sessionPrivateKey as Hex;
  assert.equal(lc(privateKeyToAccount(pk).address), vector.inputs.signer);
  const ecdsa = (await sign({ hash: userOpHash, privateKey: pk, to: "hex" })) as Hex;
  assert.equal(ecdsa, op.ecdsa);
  assert.equal(encodeSessionSignature(pids.personalMint, ecdsa), op.signature);
  assert.throws(() => encodeSessionSignature(pids.personalMint, "0x1234"));
});
