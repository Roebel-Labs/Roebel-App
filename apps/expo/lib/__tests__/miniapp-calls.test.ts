import { encodeFunctionData, parseAbi } from 'viem';
import {
  MAX_BATCH_CALLS,
  callsStatus,
  capabilities,
  parseSendCalls,
  preflightCalls,
  sponsorErrorToBridge,
} from '../miniapp-calls';
import { executeSigning, handleReadOnly } from '../miniapp-wallet';

jest.mock('thirdweb', () => ({ prepareTransaction: jest.fn((t) => t), sendTransaction: jest.fn(async () => ({ transactionHash: '0xold' })) }));
jest.mock('@/constants/thirdweb', () => ({ client: {} }));
jest.mock('@/constants/gnosis', () => ({ gnosis: { id: 100 } }));

const ACCOUNT = '0x2222222222222222222222222222222222222222';
const TARGET = '0xabc0000000000000000000000000000000000001';
const OTHER = '0x0000000000000000000000000000000000000002';
const CHECK_IN = encodeFunctionData({ abi: parseAbi(['function checkIn(uint256)']), functionName: 'checkIn', args: [1n] });
const contracts = [{ address: TARGET, label: 'Trainingsbuch', functions: ['checkIn(uint256)'] }];
const v2 = { manifestVersion: 2 as const, contracts };
const v1 = { manifestVersion: 1 as const, contracts: [] };
const declared = { to: TARGET, data: CHECK_IN };
const undeclared = { to: OTHER, data: '0xdeadbeef' };

describe('parseSendCalls', () => {
  it('parses a 5792 request', () => {
    const r = parseSendCalls(
      [{ version: '2.0.0', chainId: '0x64', from: ACCOUNT.toUpperCase().replace('0X', '0x'), atomicRequired: true, calls: [declared, { to: OTHER, value: '0x1' }], capabilities: {} }],
      ACCOUNT,
    );
    expect(r.calls).toEqual([
      { to: TARGET, data: CHECK_IN },
      { to: OTHER, value: '0x1' },
    ]);
  });

  it('refuses another chain, a foreign from, zero calls and eleven calls', () => {
    expect(() => parseSendCalls([{ chainId: '0x1', calls: [declared] }], ACCOUNT)).toThrow(expect.objectContaining({ rpcCode: 4902 }));
    expect(() => parseSendCalls([{ from: OTHER, calls: [declared] }], ACCOUNT)).toThrow(expect.objectContaining({ code: 'invalid_params' }));
    expect(() => parseSendCalls([{ calls: [] }], ACCOUNT)).toThrow(expect.objectContaining({ code: 'invalid_params' }));
    const eleven = Array.from({ length: MAX_BATCH_CALLS + 1 }, () => declared);
    expect(() => parseSendCalls([{ calls: eleven }], ACCOUNT)).toThrow(expect.objectContaining({ code: 'invalid_params' }));
    expect(() => parseSendCalls([{ calls: [{ to: '0x12' }] }], ACCOUNT)).toThrow(expect.objectContaining({ code: 'invalid_params' }));
    expect(() => parseSendCalls([], ACCOUNT)).toThrow(expect.objectContaining({ code: 'invalid_params' }));
  });
});

describe('preflightCalls', () => {
  it('a passkey account and a version-2 app: an undeclared call is refused before the sheet', () => {
    expect(preflightCalls({ app: v2, calls: [undeclared], sponsored: true })).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'unauthorized' }),
    });
    expect(preflightCalls({ app: v2, calls: [declared, undeclared], sponsored: true }).ok).toBe(false);
  });

  it('a passkey account and a version-2 app: declared calls carry the mini-app id', () => {
    expect(preflightCalls({ app: v2, calls: [declared, declared], sponsored: true })).toEqual({ ok: true, miniAppId: true });
  });

  it('a declared call with value is refused on a passkey account', () => {
    expect(preflightCalls({ app: v2, calls: [{ ...declared, value: '0x1' }], sponsored: true }).ok).toBe(false);
  });

  it('the old sign-in is never pre-checked', () => {
    expect(preflightCalls({ app: v2, calls: [undeclared], sponsored: false })).toEqual({ ok: true, miniAppId: false });
  });

  it('a version-1 app is never pre-checked', () => {
    expect(preflightCalls({ app: v1, calls: [undeclared], sponsored: true })).toEqual({ ok: true, miniAppId: false });
  });
});

describe('capabilities and status', () => {
  it('reports atomic batches on Gnosis', () => {
    expect(capabilities()).toEqual({ '0x64': { atomic: { status: 'supported' } } });
  });

  it('status maps no receipt, success and revert to 100, 200, 500', async () => {
    expect((await callsStatus('0xa', async () => null)).status).toBe(100);
    const ok = await callsStatus('0xa', async () => ({ status: '0x1' }));
    expect(ok).toEqual({ version: '2.0.0', id: '0xa', chainId: '0x64', status: 200, atomic: true, receipts: [{ status: '0x1' }] });
    expect((await callsStatus('0xa', async () => ({ status: '0x0' }))).status).toBe(500);
  });

  it('the host answers both through handleReadOnly', async () => {
    const proxy = { request: jest.fn(async () => ({ status: '0x1' })) };
    expect(await handleReadOnly('wallet_getCapabilities', [ACCOUNT], undefined, proxy)).toEqual(capabilities());
    const s = (await handleReadOnly('wallet_getCallsStatus', ['0xabc'], undefined, proxy)) as { status: number };
    expect(s.status).toBe(200);
    expect(proxy.request).toHaveBeenCalledWith('eth_getTransactionReceipt', ['0xabc'], {});
  });
});

describe('sponsor answers', () => {
  const http = (status: number, body: unknown) => Object.assign(new Error(`HTTP ${status}`), { status, body });
  it('maps 403 and the three 429 scopes', () => {
    expect(sponsorErrorToBridge(http(403, { error: 'not_sponsorable' }))).toEqual({ code: 'unauthorized', message: 'Diese Aktion ist für diese Mini-App nicht freigegeben.' });
    expect(sponsorErrorToBridge(http(429, { error: 'budget_exhausted', scope: 'app' }))).toEqual({ code: 'budget_exceeded', message: 'Das Gas-Budget dieser Mini-App ist aufgebraucht.' });
    expect(sponsorErrorToBridge(http(429, { error: 'budget_exhausted', scope: 'person' }))?.message).toMatch(/Tageslimit/);
    expect(sponsorErrorToBridge(http(429, { error: 'budget_exhausted', scope: 'global' }))?.message).toMatch(/ausgelastet/);
    expect(sponsorErrorToBridge(new Error('boom'))).toBeNull();
  });
});

describe('executing wallet_sendCalls', () => {
  function account(over: Record<string, unknown> = {}) {
    return {
      address: ACCOUNT,
      sendTransaction: jest.fn(async () => ({ transactionHash: '0xone' })),
      sendBatchTransaction: jest.fn(async () => ({ transactionHash: '0xmany' })),
      ...over,
    };
  }
  const req = (calls: unknown[]) => [{ version: '2.0.0', chainId: '0x64', calls }];

  it('a batch goes out as one batch transaction with the mini-app id', async () => {
    const a = account();
    const r = await executeSigning('wallet_sendCalls', req([declared, declared]), a as never, { miniAppId: 'app-1' });
    expect(r).toEqual({ id: '0xmany' });
    expect(a.sendBatchTransaction).toHaveBeenCalledWith([
      { to: TARGET, data: CHECK_IN, value: 0n, chainId: 100, miniAppId: 'app-1' },
      { to: TARGET, data: CHECK_IN, value: 0n, chainId: 100, miniAppId: 'app-1' },
    ]);
  });

  it('a single declared eth_sendTransaction on a passkey account goes to the account directly', async () => {
    const a = account();
    const r = await executeSigning('eth_sendTransaction', [declared], a as never, { miniAppId: 'app-1' });
    expect(r).toBe('0xone');
    expect(a.sendTransaction).toHaveBeenCalledWith({ to: TARGET, data: CHECK_IN, value: 0n, chainId: 100, miniAppId: 'app-1' });
  });

  it('without a batch method several calls are refused', async () => {
    const a = account({ sendBatchTransaction: undefined });
    await expect(executeSigning('wallet_sendCalls', req([declared, undeclared]), a as never)).rejects.toMatchObject({ code: 'unsupported' });
  });

  it('a sponsor refusal of a mini-app op becomes the bridge message', async () => {
    const a = account({
      sendTransaction: jest.fn(async () => {
        throw Object.assign(new Error('HTTP 429'), { status: 429, body: { error: 'budget_exhausted', scope: 'app' } });
      }),
    });
    await expect(executeSigning('eth_sendTransaction', [declared], a as never, { miniAppId: 'app-1' })).rejects.toEqual({
      code: 'budget_exceeded',
      message: 'Das Gas-Budget dieser Mini-App ist aufgebraucht.',
    });
  });
});
