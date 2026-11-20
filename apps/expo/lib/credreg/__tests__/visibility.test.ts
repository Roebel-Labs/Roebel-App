jest.mock('@/constants/gnosis', () => ({ credentialRegistryGnosisAddress: '0x' + '11'.repeat(20), credentialRegistryDeployBlock: 0 }));
jest.mock('@/lib/org-safe/send', () => ({ sendOrgCalls: jest.fn() }));

import { renounceCall } from '@netizen-labs/credential-registry';
import type { Hex } from 'viem';
import { makePrivate } from '../visibility';

const typeId = ('0x' + '0'.repeat(63) + '7') as Hex;
const account = { address: '0x' + 'ab'.repeat(20) } as any;

describe('makePrivate', () => {
  it('sends exactly one renounce for the app registry and nothing else', async () => {
    const send = jest.fn(async () => {});
    const r = await makePrivate(account, { typeId, state: 'valid' }, { send });
    expect(r).toEqual({ ok: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(account, [renounceCall(('0x' + '11'.repeat(20)) as any, typeId)]);
  });

  it('refuses an expired card and never sends', async () => {
    const send = jest.fn(async () => {});
    const r = await makePrivate(account, { typeId, state: 'expired' }, { send });
    expect(r.ok).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('a failed send returns a German message without an address', async () => {
    const send = jest.fn(async () => {
      throw new Error('reverted for 0x' + 'ab'.repeat(20));
    });
    const r = await makePrivate(account, { typeId, state: 'valid' }, { send });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).not.toMatch(/0x[0-9a-fA-F]{6,}/);
  });
});
