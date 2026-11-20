import { decodeFunctionData, encodeAbiParameters, pad, type Address } from 'viem';
import { SAFE_4337_MODULE, SAFE_FALLBACK_HANDLER_SLOT, SOCIAL_RECOVERY_MODULE } from '../constants';
import { invalidateSafeLayout, readModules, readSafeLayout } from '../safe-layout';
import { SAFE7579 } from '../session-keys/builders';

const SAFE: Address = '0xE3D18FECDcF8E8B656b11340790f7c0147632deB';

function rpcFetch(handler: { current: Address }) {
  const calls: any[] = [];
  const f = jest.fn(async (_url: string, init: { body: string }) => {
    const req = JSON.parse(init.body);
    calls.push(req);
    let result: string;
    if (req.method === 'eth_getStorageAt') {
      expect(req.params[1]).toBe(SAFE_FALLBACK_HANDLER_SLOT);
      result = pad(handler.current.toLowerCase() as `0x${string}`, { size: 32 });
    } else if (req.method === 'eth_call') {
      result = encodeAbiParameters(
        [{ type: 'address[]' }, { type: 'address' }],
        [[SOCIAL_RECOVERY_MODULE, SAFE_4337_MODULE], '0x0000000000000000000000000000000000000001'],
      );
    } else throw new Error(`unexpected ${req.method}`);
    return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: req.id, result }) };
  });
  return { f, calls };
}

describe('readSafeLayout', () => {
  beforeEach(() => invalidateSafeLayout(SAFE));

  test('handler = Safe4337Module → 4337', async () => {
    const { f } = rpcFetch({ current: SAFE_4337_MODULE });
    await expect(readSafeLayout(SAFE, { fetch: f, rpcUrl: 'http://rpc' })).resolves.toBe('4337');
  });

  test('handler = Safe7579 → 7579', async () => {
    const { f } = rpcFetch({ current: SAFE7579 });
    await expect(readSafeLayout(SAFE, { fetch: f, rpcUrl: 'http://rpc' })).resolves.toBe('7579');
  });

  test('any other handler throws unknown Safe layout (and is not memoized)', async () => {
    const h = { current: SOCIAL_RECOVERY_MODULE };
    const { f } = rpcFetch(h);
    await expect(readSafeLayout(SAFE, { fetch: f, rpcUrl: 'http://rpc' })).rejects.toThrow('unknown Safe layout');
    h.current = SAFE7579;
    await expect(readSafeLayout(SAFE, { fetch: f, rpcUrl: 'http://rpc' })).resolves.toBe('7579');
  });

  test('memoized per Safe; invalidateSafeLayout clears the memo', async () => {
    const h = { current: SAFE_4337_MODULE };
    const { f } = rpcFetch(h);
    const deps = { fetch: f, rpcUrl: 'http://rpc' };
    expect(await readSafeLayout(SAFE, deps)).toBe('4337');
    h.current = SAFE7579;
    expect(await readSafeLayout(SAFE, deps)).toBe('4337');
    expect(f).toHaveBeenCalledTimes(1);
    invalidateSafeLayout(SAFE);
    expect(await readSafeLayout(SAFE, deps)).toBe('7579');
    expect(f).toHaveBeenCalledTimes(2);
  });
});

describe('readModules', () => {
  test('calls getModulesPaginated(SENTINEL, 10) and returns the list', async () => {
    const { f, calls } = rpcFetch({ current: SAFE_4337_MODULE });
    const mods = await readModules(SAFE, { fetch: f, rpcUrl: 'http://rpc' });
    expect(mods).toEqual([SOCIAL_RECOVERY_MODULE, SAFE_4337_MODULE]);
    const abi = [
      {
        type: 'function',
        name: 'getModulesPaginated',
        stateMutability: 'view',
        inputs: [{ type: 'address' }, { type: 'uint256' }],
        outputs: [],
      },
    ] as const;
    const { args } = decodeFunctionData({ abi, data: calls[0].params[0].data });
    expect(args).toEqual(['0x0000000000000000000000000000000000000001', 10n]);
    expect(calls[0].params[0].to).toBe(SAFE);
  });
});
