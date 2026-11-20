import { assertHostChain, executeSigning, handleReadOnly, unsupportedChain } from '../miniapp-wallet';

jest.mock('thirdweb', () => ({ prepareTransaction: jest.fn(), sendTransaction: jest.fn() }));
jest.mock('@/constants/thirdweb', () => ({ client: {} }));
jest.mock('@/constants/gnosis', () => ({ gnosis: { id: 100 } }));

const proxy = { request: jest.fn() };

describe('chain handling', () => {
  it('switching to Gnosis succeeds', async () =>
    expect(await handleReadOnly('wallet_switchEthereumChain', [{ chainId: '0x64' }], undefined, proxy)).toBeNull());

  it('switching to Base is refused with 4902', async () => {
    await expect(
      handleReadOnly('wallet_switchEthereumChain', [{ chainId: '0x2105' }], undefined, proxy),
    ).rejects.toMatchObject({ code: 'unsupported', rpcCode: 4902 });
  });

  it('switching without a chain id is invalid', async () => {
    await expect(handleReadOnly('wallet_switchEthereumChain', [], undefined, proxy)).rejects.toMatchObject({
      code: 'invalid_params',
    });
  });

  it('adding another chain is refused with 4902', async () => {
    await expect(
      handleReadOnly('wallet_addEthereumChain', [{ chainId: '0x1', rpcUrls: ['https://x'] }], undefined, proxy),
    ).rejects.toMatchObject({ code: 'unsupported', rpcCode: 4902 });
    expect(await handleReadOnly('wallet_addEthereumChain', [{ chainId: '0x64' }], undefined, proxy)).toBeNull();
  });

  it('assertHostChain accepts 100 in its three spellings and nothing else', () => {
    for (const ok of [undefined, 100, '0x64', '100']) expect(() => assertHostChain(ok)).not.toThrow();
    for (const bad of [1, '0x1', '0x2105', 8453, null, '', 'gnosis', {}]) {
      expect(() => assertHostChain(bad)).toThrow();
    }
    try {
      assertHostChain('0x1');
    } catch (e) {
      expect(e).toEqual(unsupportedChain());
    }
    expect(unsupportedChain()).toEqual({
      code: 'unsupported',
      message: 'Diese Mini-App läuft nur auf der Gnosis Chain.',
      rpcCode: 4902,
    });
  });

  it('eth_sendTransaction for another chain is refused before anything is sent', async () => {
    const account = { address: '0x2222222222222222222222222222222222222222' } as never;
    await expect(
      executeSigning('eth_sendTransaction', [{ to: '0x1111111111111111111111111111111111111111', chainId: '0x1' }], account),
    ).rejects.toMatchObject({ rpcCode: 4902 });
  });
});
