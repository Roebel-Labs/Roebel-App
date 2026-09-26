import { hashTypedData, keccak256, stringToHex, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  buildAddAdminRequest,
  encodeHandoverUserOpCallData,
  encodeSetPermissions,
  signerPermissionTypedData,
  type SignerPermissionRequest,
} from '../legacy-handover';
import vector from './passkey-safe-vector.json';

const h = vector.handover;
const legacy = h.legacyAccount as `0x${string}`;

const fixtureReq: SignerPermissionRequest = {
  signer: h.signer as `0x${string}`,
  isAdmin: 1,
  approvedTargets: [],
  nativeTokenLimitPerTransaction: 0n,
  permissionStartTimestamp: 0n,
  permissionEndTimestamp: 0n,
  reqValidityStartTimestamp: BigInt(h.reqValidityStartTimestamp),
  reqValidityEndTimestamp: BigInt(h.reqValidityEndTimestamp),
  uid: h.uid as Hex,
};

describe('legacy thirdweb Account handover', () => {
  it('uid in the fixture is keccak256("roebel.app/passkey-handover/fixture")', () => {
    expect(keccak256(stringToHex('roebel.app/passkey-handover/fixture'))).toBe(h.uid);
  });

  it('EIP-712 digest equals the fork-verified digest', () => {
    expect(hashTypedData(signerPermissionTypedData(legacy, fixtureReq))).toBe(h.digest);
  });

  it('the fixture EOA signature reproduces with viem (RFC 6979)', async () => {
    const eoa = privateKeyToAccount(h.eoaPrivateKey as Hex);
    expect(eoa.address).toBe(h.eoa);
    const sig = await eoa.signTypedData(signerPermissionTypedData(legacy, fixtureReq));
    expect(sig).toBe(h.signature);
  });

  it('encodes setPermissionsForSigner calldata byte-for-byte', () => {
    expect(encodeSetPermissions(fixtureReq, h.signature as Hex)).toBe(h.setPermissionsForSignerCallData);
  });

  it('wraps the handover in Safe4337Module.executeUserOp(legacy, 0, data, 0)', () => {
    expect(encodeHandoverUserOpCallData(legacy, h.setPermissionsForSignerCallData as Hex)).toBe(
      vector.userOp.callData,
    );
  });

  it('buildAddAdminRequest always adds (isAdmin 1), never removes', () => {
    const req = buildAddAdminRequest(h.signer as `0x${string}`, 1_790_000_000);
    expect(req.isAdmin).toBe(1);
    expect(req.signer).toBe(h.signer);
    expect(req.approvedTargets).toEqual([]);
    expect(req.reqValidityStartTimestamp).toBeLessThanOrEqual(1_790_000_000n);
    expect(req.reqValidityEndTimestamp).toBeGreaterThan(1_790_000_000n);
    expect(req.uid).toMatch(/^0x[0-9a-f]{64}$/);
    // two requests never share a uid (replay protection on the Account)
    expect(buildAddAdminRequest(h.signer as `0x${string}`, 1_790_000_000).uid).not.toBe(req.uid);
  });
});
