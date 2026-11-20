import { WALLET_SIGN_METHODS } from '@netizen-labs/miniapp-sdk/host';
import { handleReadOnly, isSigningMethod } from '../miniapp-wallet';

// jest.mock calls are hoisted above the imports.
jest.mock('thirdweb', () => ({ prepareTransaction: jest.fn(), sendTransaction: jest.fn() }));
jest.mock('@/constants/thirdweb', () => ({ client: {} }));
jest.mock('@/constants/gnosis', () => ({ gnosis: { id: 100 } }));

describe('isSigningMethod', () => {
  it('follows the shared SDK rule for every signing method', () => {
    for (const m of WALLET_SIGN_METHODS) expect(isSigningMethod(m)).toBe(true);
  });

  it('read methods and unknown methods are not signing methods', () => {
    expect(isSigningMethod('eth_chainId')).toBe(false);
    expect(isSigningMethod('wallet_grantPermissions')).toBe(false);
  });

  it('an unknown method is refused (default deny)', async () => {
    await expect(handleReadOnly('wallet_grantPermissions', [], undefined, undefined)).rejects.toMatchObject({ code: 'unsupported' });
  });

  it('read methods are answered without signing', async () => {
    expect(await handleReadOnly('eth_chainId', [], undefined, undefined)).toBe('0x64');
  });

  it('chain reads go to the proxy with the account only when one is given', async () => {
    const request = jest.fn(async () => '0xabc');
    const proxy = { request };
    const account = { address: '0x2222222222222222222222222222222222222222' } as never;
    expect(await handleReadOnly('eth_call', [{ to: '0x1' }], account, proxy)).toBe('0xabc');
    expect(request).toHaveBeenLastCalledWith('eth_call', [{ to: '0x1' }], {
      account: '0x2222222222222222222222222222222222222222',
    });
    await handleReadOnly('eth_blockNumber', [], undefined, proxy);
    expect(request).toHaveBeenLastCalledWith('eth_blockNumber', [], { account: undefined });
  });
});
