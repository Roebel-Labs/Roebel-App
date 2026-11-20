import { getAddress, hexToBigInt, sliceHex, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getUserOperationHash } from 'viem/account-abstraction';
import {
  CIRCLES_HUB,
  OWNABLE_VALIDATOR,
  ROEBEL_GROUP,
  SAFE7579,
  SESSION_NONCE_KEY,
  SESSION_SALTS,
  SMART_SESSIONS,
  TIME_FRAME_POLICY,
  UNI_ACTION_POLICY,
  encode7579Execute,
  encodeSessionSignature,
  grantCallData,
  groupMintData,
  legacyClaimBatchData,
  migrationCallData,
  mintSessions,
  permissionIdsOf,
  personalMintData,
  prev4337AfterEnable,
  revokeCallData,
  sessionClaimCallData,
  smartSessionInitData,
  withValidatorPrefix,
} from '../session-keys/builders';
import { SAFE_4337_MODULE, SOCIAL_RECOVERY_MODULE } from '../constants';
import vector from './session-keys-vector.json';

const lc = (h: string) => h.toLowerCase();
const safe = vector.inputs.safe as Address;
const p = {
  legacy: vector.inputs.legacy as Address,
  signer: vector.inputs.signer as Address,
  validUntil: Number(vector.inputs.validUntil),
};
const pids = permissionIdsOf(p);

describe('device-session builders vs the fork golden vector', () => {
  test('addresses match the vector', () => {
    expect(lc(SAFE7579)).toBe(vector.addresses.safe7579);
    expect(lc(SMART_SESSIONS)).toBe(vector.addresses.smartSessions);
    expect(lc(OWNABLE_VALIDATOR)).toBe(vector.addresses.ownableValidator);
    expect(lc(UNI_ACTION_POLICY)).toBe(vector.addresses.uniActionPolicy);
    expect(lc(TIME_FRAME_POLICY)).toBe(vector.addresses.timeFramePolicy);
    expect(lc(CIRCLES_HUB)).toBe(vector.addresses.hub);
    expect(lc(ROEBEL_GROUP)).toBe(vector.addresses.roebelGroup);
    expect(lc(SAFE_4337_MODULE)).toBe(vector.addresses.safe4337Module);
  });

  test('session salts match the vector', () => {
    expect(SESSION_SALTS.personalMint).toBe(vector.salts.personalMint);
    expect(SESSION_SALTS.groupMint).toBe(vector.salts.groupMint);
  });

  test('vector signer is the address of the vector session key', () => {
    expect(lc(privateKeyToAccount(vector.inputs.sessionPrivateKey as Hex).address)).toBe(vector.inputs.signer);
  });

  test('permissionIdsOf matches SmartSession.getPermissionId', () => {
    expect(pids.personalMint).toBe(vector.permissionIds.personalMint);
    expect(pids.groupMint).toBe(vector.permissionIds.groupMint);
  });

  test('mintSessions = [personalMint, groupMint], mint only', () => {
    const s = mintSessions(p);
    expect(s.map((x) => x.salt)).toEqual([SESSION_SALTS.personalMint, SESSION_SALTS.groupMint]);
    expect(s.every((x) => x.permitERC4337Paymaster && x.actions.length === 1)).toBe(true);
  });

  test('smartSessionInitData reproduces the vector', () => {
    expect(lc(smartSessionInitData(p))).toBe(vector.smartSessionInitData);
  });

  test('prev4337AfterEnable reproduces the vector prev4337', () => {
    expect(lc(prev4337AfterEnable(vector.inputs.modulesBefore as Address[]))).toBe(vector.inputs.prev4337);
  });

  test('prev4337AfterEnable: 4337 first → SAFE7579, else the module before it', () => {
    expect(prev4337AfterEnable([SAFE_4337_MODULE, SOCIAL_RECOVERY_MODULE])).toBe(SAFE7579);
    expect(prev4337AfterEnable([SOCIAL_RECOVERY_MODULE, SAFE_4337_MODULE])).toBe(SOCIAL_RECOVERY_MODULE);
    expect(() => prev4337AfterEnable([SOCIAL_RECOVERY_MODULE])).toThrow();
  });

  test('migrationCallData reproduces the fork batch byte for byte', () => {
    expect(lc(migrationCallData({ ...p, safe, prev4337: vector.inputs.prev4337 as Address }))).toBe(vector.migrationCallData);
  });

  test('grantCallData replace=false is EXEC_SINGLE self.installModule', () => {
    expect(lc(grantCallData({ ...p, safe, replace: false }))).toBe(vector.grantInstallCallData);
  });

  test('grantCallData replace=true is uninstall(SENTINEL,"") + install', () => {
    expect(lc(grantCallData({ ...p, safe, replace: true }))).toBe(vector.grantReplaceCallData);
  });

  test('revokeCallData (both pids, EXEC_BATCH) reproduces the vector', () => {
    expect(lc(revokeCallData([pids.personalMint, pids.groupMint]))).toBe(vector.revokeCallData);
  });

  test('revokeCallData with one pid is EXEC_SINGLE', () => {
    const cd = revokeCallData([pids.personalMint]);
    expect(sliceHex(cd, 4, 5)).toBe('0x00');
  });

  test('SESSION_NONCE_KEY equals the vector', () => {
    expect(SESSION_NONCE_KEY).toBe(BigInt(vector.sessionNonceKey));
    expect(BigInt(vector.sessionOp.nonce)).toBe(SESSION_NONCE_KEY << 64n);
  });

  test('session claim callData (personalMint, groupMint) reproduces the vector', () => {
    expect(lc(sessionClaimCallData(p.legacy, personalMintData()))).toBe(vector.personalMintSessionCallData);
    expect(lc(sessionClaimCallData(p.legacy, groupMintData(p.legacy, BigInt(vector.groupMintAmount))))).toBe(
      vector.groupMintSessionCallData,
    );
  });

  test('root claim (kill-switch fallback) = EXEC_SINGLE legacy.executeBatch', () => {
    const cd = encode7579Execute([{ to: p.legacy, data: legacyClaimBatchData(p.legacy, BigInt(vector.groupMintAmount)) }]);
    expect(lc(cd)).toBe(vector.rootClaimCallData);
    expect(vector.rootOp.callData).toBe(vector.rootClaimCallData);
  });

  test('encode7579Execute never emits callType 0xff', () => {
    const call = { to: p.legacy, data: personalMintData() };
    for (const calls of [[call], [call, call], [call, call, call]]) {
      const mode = sliceHex(encode7579Execute(calls), 4, 36);
      expect(['0x00', '0x01']).toContain(sliceHex(mode, 0, 1));
      expect(sliceHex(mode, 0, 1)).not.toBe('0xff');
      expect(hexToBigInt(sliceHex(mode, 1, 32))).toBe(0n);
    }
    expect(() => encode7579Execute([])).toThrow();
  });

  test('session op: userOpHash, ECDSA and signature reproduce the vector', async () => {
    const op = vector.sessionOp;
    expect(op.callData).toBe(vector.personalMintSessionCallData);
    const pmd = op.paymasterAndData as Hex;
    const hash = getUserOperationHash({
      chainId: Number(vector.chainId),
      entryPointAddress: getAddress(vector.entryPoint),
      entryPointVersion: '0.7',
      userOperation: {
        sender: getAddress(op.sender),
        nonce: BigInt(op.nonce),
        callData: op.callData as Hex,
        callGasLimit: BigInt(op.callGasLimit),
        verificationGasLimit: BigInt(op.verificationGasLimit),
        preVerificationGas: BigInt(op.preVerificationGas),
        maxFeePerGas: BigInt(op.maxFeePerGas),
        maxPriorityFeePerGas: BigInt(op.maxPriorityFeePerGas),
        paymaster: getAddress(sliceHex(pmd, 0, 20)),
        paymasterVerificationGasLimit: hexToBigInt(sliceHex(pmd, 20, 36)),
        paymasterPostOpGasLimit: hexToBigInt(sliceHex(pmd, 36, 52)),
        paymasterData: sliceHex(pmd, 52),
        signature: '0x',
      },
    });
    expect(hash).toBe(op.userOpHash);
    const ecdsa = await privateKeyToAccount(vector.inputs.sessionPrivateKey as Hex).sign({ hash });
    expect(lc(ecdsa)).toBe(op.ecdsa);
    expect(encodeSessionSignature(pids.personalMint, ecdsa)).toBe(op.signature);
  });

  test('encodeSessionSignature rejects malformed inputs', () => {
    expect(() => encodeSessionSignature('0x00', vector.sessionOp.ecdsa as Hex)).toThrow();
    expect(() => encodeSessionSignature(pids.personalMint, '0x1234')).toThrow();
  });

  test('withValidatorPrefix reproduces the ERC-1271 vector', () => {
    expect(withValidatorPrefix(vector.erc1271.safeSignature as Hex)).toBe(vector.erc1271.prefixedSignature);
  });
});
