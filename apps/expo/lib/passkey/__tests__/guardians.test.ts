jest.mock('react-native-passkey', () => ({ Passkey: { create: jest.fn(), get: jest.fn(), isSupported: () => true } }));

import { createPublicKey, verify as nodeVerify } from 'crypto';
import { concatHex, decodeFunctionData, getAddress, hexToBytes, hexToString, numberToHex, type Address, type Hex } from 'viem';
import {
  encodeAddGuardian,
  encodeCancelRecovery,
  encodeChangeThreshold,
  encodeConfirmRecovery,
  encodeCreateSigner,
  encodeExecuteRecovery,
  encodeFinalizeRecovery,
  encodeMultiConfirmRecovery,
  encodeRevokeGuardian,
  prevGuardianOf,
  readGuardians,
  readRecoveryNonce,
  readRecoveryRequest,
  readThreshold,
  readWebAuthnSigner,
  recoveryApprovalTypedData,
  recoveryHash,
  safeMessageHash,
  signRecoveryApprovalAsGuardian,
  socialRecoveryAbi,
} from '../guardians';
import {
  SAFE_WEBAUTHN_SIGNER_FACTORY,
  SOCIAL_RECOVERY_MODULE,
  SOCIAL_RECOVERY_SENTINEL,
  WEBAUTHN_VERIFIERS,
} from '../constants';
import { webAuthnSigningDigest } from '../userop';
import rv from './recovery-vector.json';

const g = rv.guardianApproval;
const wallet = getAddress(g.wallet);
const newOwner = getAddress(g.newOwner);
const guardianSafe = getAddress(g.guardianSafe);
const clientDataJSON = hexToString(g.clientDataJSONHex as Hex);
const G1: Address = '0x1111111111111111111111111111111111111111';
const G2: Address = '0x2222222222222222222222222222222222222222';

describe('guardians — recovery approval vs the fork fixture', () => {
  it('recoveryHash equals SRM.getRecoveryHash', () => {
    expect(recoveryHash(wallet, [newOwner], BigInt(g.newThreshold), BigInt(g.nonce))).toBe(g.recoveryHash);
    const td = recoveryApprovalTypedData(wallet, [newOwner], 1, 0);
    expect(td.domain).toEqual({ name: 'Social Recovery Module', version: '0.0.1', chainId: 100, verifyingContract: SOCIAL_RECOVERY_MODULE });
  });

  it('safeMessageHash equals the guardian Safe CompatibilityFallbackHandler message hash', () => {
    expect(safeMessageHash(guardianSafe, g.recoveryHash as Hex)).toBe(g.safeMessageHash);
  });

  it('the fixture (r, s) is a P-256 signature by the guardian passkey over the WebAuthn digest', () => {
    const { digest, message } = webAuthnSigningDigest(g.authenticatorData as Hex, clientDataJSON);
    const b64u = (h: Hex) => Buffer.from(hexToBytes(h)).toString('base64url');
    const pub = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(g.guardianX as Hex), y: b64u(g.guardianY as Hex) }, format: 'jwk' });
    const sig = Buffer.from(hexToBytes(concatHex([g.r as Hex, g.s as Hex])));
    expect(nodeVerify('sha256', Buffer.from(hexToBytes(message)), { key: pub, dsaEncoding: 'ieee-p1363' }, sig)).toBe(true);
    expect(digest).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('signRecoveryApprovalAsGuardian reproduces the guardian signature byte-for-byte', async () => {
    const sign = jest.fn(async (_id: string, challenge: Hex) => {
      expect(challenge).toBe(g.safeMessageHash);
      return { authenticatorData: g.authenticatorData as Hex, clientDataJSON, r: BigInt(g.r), s: BigInt(g.s) };
    });
    const approval = await signRecoveryApprovalAsGuardian(
      { credentialId: 'g1', guardianSafe, wallet, newOwners: [newOwner], threshold: 1, nonce: 0 },
      { sign },
    );
    expect(approval).toEqual({ signer: guardianSafe, signature: g.guardianSignature });
    expect(sign).toHaveBeenCalledTimes(1);
  });

  it('encodeMultiConfirmRecovery sorts approvals by signer and reproduces the accepted callData', () => {
    const decoded = decodeFunctionData({ abi: socialRecoveryAbi, data: rv.multiConfirm.callData as Hex });
    expect(decoded.functionName).toBe('multiConfirmRecovery');
    const [w, owners, t, sigs, execute] = decoded.args as [Address, Address[], bigint, { signer: Address; signature: Hex }[], boolean];
    const call = encodeMultiConfirmRecovery(w, owners, t, [...sigs].reverse(), execute);
    expect(call.to).toBe(SOCIAL_RECOVERY_MODULE);
    expect(call.data).toBe(rv.multiConfirm.callData);
    expect(() => encodeMultiConfirmRecovery(w, owners, t, [sigs[0], sigs[0]])).toThrow(/duplicate/);
    expect(() => encodeMultiConfirmRecovery(w, owners, t, [])).toThrow(/no guardian/);
  });
});

describe('guardians — encoders', () => {
  const decode = (data: Hex) => decodeFunctionData({ abi: socialRecoveryAbi, data });

  it('guardian management', () => {
    expect(decode(encodeAddGuardian(G1, 2).data)).toEqual({ functionName: 'addGuardianWithThreshold', args: [G1, 2n] });
    expect(decode(encodeRevokeGuardian(SOCIAL_RECOVERY_SENTINEL, G1, 1).data)).toEqual({
      functionName: 'revokeGuardianWithThreshold',
      args: [SOCIAL_RECOVERY_SENTINEL, G1, 1n],
    });
    expect(decode(encodeChangeThreshold(3n).data)).toEqual({ functionName: 'changeThreshold', args: [3n] });
    expect(encodeAddGuardian(G1, 1).to).toBe(SOCIAL_RECOVERY_MODULE);
  });

  it('recovery calls', () => {
    expect(decode(encodeFinalizeRecovery(wallet).data)).toEqual({ functionName: 'finalizeRecovery', args: [wallet] });
    expect(decode(encodeCancelRecovery().data).functionName).toBe('cancelRecovery');
    expect(decode(encodeConfirmRecovery(wallet, [newOwner], 1).data)).toEqual({
      functionName: 'confirmRecovery',
      args: [wallet, [newOwner], 1n, false],
    });
    expect(decode(encodeExecuteRecovery(wallet, [newOwner], 1).data)).toEqual({
      functionName: 'executeRecovery',
      args: [wallet, [newOwner], 1n],
    });
    expect(encodeFinalizeRecovery(wallet).data.slice(0, 10)).toBe('0x315a7af3');
    expect(encodeMultiConfirmRecovery(wallet, [newOwner], 1, [{ signer: G1, signature: '0x01' }]).data.slice(0, 10)).toBe('0x0728e1e7');
  });

  it('createSigner for the new passkey with the shared verifiers', () => {
    const c = encodeCreateSigner(rv.newX as Hex, rv.newY as Hex);
    expect(c.to).toBe(SAFE_WEBAUTHN_SIGNER_FACTORY);
    expect(c.data.slice(0, 10)).toBe('0x0d2f0489');
    expect(c.data).toContain(rv.newX.slice(2));
    expect(c.data).toContain(numberToHex(WEBAUTHN_VERIFIERS, { size: 32 }).slice(2));
  });

  it('prevGuardianOf walks the linked list (sentinel for the first)', () => {
    expect(prevGuardianOf([G1, G2], G1)).toBe(SOCIAL_RECOVERY_SENTINEL);
    expect(prevGuardianOf([G1, G2], G2)).toBe(G1);
    expect(() => prevGuardianOf([G1], G2)).toThrow(/not a guardian/);
  });
});

describe('guardians — reads go through the injected client', () => {
  it('reads guardians, threshold, nonce, request and the per-key signer', async () => {
    const readContract = jest.fn(async ({ address, functionName, args }: any) => {
      if (address === SAFE_WEBAUTHN_SIGNER_FACTORY) {
        expect(args).toEqual([BigInt(rv.newX), BigInt(rv.newY), WEBAUTHN_VERIFIERS]);
        return newOwner;
      }
      expect(address).toBe(SOCIAL_RECOVERY_MODULE);
      expect(args[0]).toBe(wallet);
      switch (functionName) {
        case 'getGuardians':
          return [G1, G2];
        case 'threshold':
          return 2n;
        case 'nonce':
          return 4n;
        case 'getRecoveryRequest':
          return { guardiansApprovalCount: 2n, newThreshold: 1n, executeAfter: 1_790_259_200, newOwners: [newOwner] };
        default:
          throw new Error(functionName);
      }
    });
    const client = { readContract };
    expect(await readGuardians(wallet, client)).toEqual([G1, G2]);
    expect(await readThreshold(wallet, client)).toBe(2n);
    expect(await readRecoveryNonce(wallet, client)).toBe(4n);
    expect(await readRecoveryRequest(wallet, client)).toEqual({
      guardiansApprovalCount: 2n,
      newThreshold: 1n,
      executeAfter: 1_790_259_200n,
      newOwners: [newOwner],
    });
    expect(await readWebAuthnSigner(rv.newX as Hex, rv.newY as Hex, client)).toBe(newOwner);
  });
});
