import type { Address } from 'viem';
import type { RecoveryRequest } from '../guardians';
import { sessionOwnerState } from '../session-health';

const SAFE = '0x1111111111111111111111111111111111111111' as Address;
const OWNER = '0x22222222222222222222222222222222222222ab' as Address;
const OTHER = '0x3333333333333333333333333333333333333333' as Address;
const session = { safe: SAFE, owner: OWNER };

const noRequest: RecoveryRequest = { guardiansApprovalCount: 0n, newThreshold: 0n, executeAfter: 0n, newOwners: [] };
const foreign: RecoveryRequest = { guardiansApprovalCount: 1n, newThreshold: 1n, executeAfter: 1_800_000_000n, newOwners: [OTHER] };
const mine: RecoveryRequest = { ...foreign, newOwners: [OWNER] };

function deps(over: Partial<Parameters<typeof sessionOwnerState>[1]> = {}) {
  return {
    isDeployed: jest.fn(async () => true),
    readOwners: jest.fn(async () => [OWNER]),
    readRequest: jest.fn(async () => noRequest as RecoveryRequest | null),
    ...over,
  };
}

describe('sessionOwnerState', () => {
  it('a Safe that is not deployed yet is ok and reads nothing else', async () => {
    const d = deps({ isDeployed: jest.fn(async () => false) });
    await expect(sessionOwnerState(session, d)).resolves.toBe('ok');
    expect(d.readOwners).not.toHaveBeenCalled();
  });

  it('owner still an owner, no request: ok (case-insensitive)', async () => {
    const d = deps({ readOwners: jest.fn(async () => ['0x22222222222222222222222222222222222222AB' as Address]) });
    await expect(sessionOwnerState(session, d)).resolves.toBe('ok');
    await expect(sessionOwnerState(session, deps({ readRequest: jest.fn(async () => null) }))).resolves.toBe('ok');
  });

  it('owner still an owner and a foreign request pending: recovering', async () => {
    await expect(sessionOwnerState(session, deps({ readRequest: jest.fn(async () => foreign) }))).resolves.toBe('recovering');
    // A recovery TO this device's owner is not foreign.
    await expect(sessionOwnerState(session, deps({ readRequest: jest.fn(async () => mine) }))).resolves.toBe('ok');
  });

  it('owner no longer an owner: replaced', async () => {
    const d = deps({ readOwners: jest.fn(async () => [OTHER]) });
    await expect(sessionOwnerState(session, d)).resolves.toBe('replaced');
  });

  it('readOwners throwing: unknown, never replaced', async () => {
    const d = deps({ readOwners: jest.fn(async () => Promise.reject(new Error('rpc down'))) });
    await expect(sessionOwnerState(session, d)).resolves.toBe('unknown');
  });

  it('any other read error, or an empty owner list, is unknown', async () => {
    await expect(sessionOwnerState(session, deps({ isDeployed: jest.fn(async () => Promise.reject(new Error('x'))) }))).resolves.toBe('unknown');
    await expect(sessionOwnerState(session, deps({ readRequest: jest.fn(async () => Promise.reject(new Error('x'))) }))).resolves.toBe('unknown');
    await expect(sessionOwnerState(session, deps({ readOwners: jest.fn(async () => []) }))).resolves.toBe('unknown');
  });
});
