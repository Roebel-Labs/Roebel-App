import { createRpcProxy, PROXIED_METHODS, RPC_LIMITS } from '../miniapp-rpc';

type Body = { jsonrpc: string; id: number; method: string; params: unknown[] };

/** Fake fetch: records each JSON-RPC body and answers with `answer(body)`. */
function fakeFetch(answer: (b: Body) => unknown) {
  const bodies: Body[] = [];
  const fn = jest.fn(async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as Body;
    bodies.push(body);
    const out = answer(body);
    const json = out && typeof out === 'object' && 'error' in (out as object)
      ? { jsonrpc: '2.0', id: body.id, ...(out as object) }
      : { jsonrpc: '2.0', id: body.id, result: out };
    return { ok: true, status: 200, text: async () => JSON.stringify(json) };
  });
  return { fn: fn as unknown as typeof fetch, bodies };
}

const ADDR = '0x1111111111111111111111111111111111111111';
const ACCOUNT = '0x2222222222222222222222222222222222222222';

function setup(answer: (b: Body) => unknown = () => '0x1', now = () => 0) {
  const f = fakeFetch(answer);
  const p = createRpcProxy({ rpcUrl: 'https://rpc.test', fetch: f.fn, now });
  return { p, bodies: f.bodies };
}

describe('createRpcProxy', () => {
  it('proxies exactly the twelve eth_* read methods', () => {
    expect(PROXIED_METHODS).toHaveLength(12);
    expect(PROXIED_METHODS.every((m) => m.startsWith('eth_'))).toBe(true);
  });

  it('forwards eth_call and returns the result', async () => {
    const { p, bodies } = setup(() => '0xabcd');
    const r = await p.request('eth_call', [{ to: ADDR, data: '0x12345678' }, 'latest'], {});
    expect(r).toBe('0xabcd');
    expect(bodies).toHaveLength(1);
    expect(bodies[0].method).toBe('eth_call');
    expect(bodies[0].params).toEqual([{ to: ADDR, data: '0x12345678' }, 'latest']);
  });

  it('adds the account as from only when one is given', async () => {
    const { p, bodies } = setup(() => '0x');
    await p.request('eth_call', [{ to: ADDR }, 'latest'], { account: ACCOUNT });
    await p.request('eth_estimateGas', [{ to: ADDR }], {});
    await p.request('eth_call', [{ to: ADDR, from: ADDR }, 'latest'], { account: ACCOUNT });
    expect((bodies[0].params[0] as { from?: string }).from).toBe(ACCOUNT);
    expect((bodies[1].params[0] as { from?: string }).from).toBeUndefined();
    expect((bodies[2].params[0] as { from?: string }).from).toBe(ADDR);
  });

  it('refuses eth_getLogs without an address', async () => {
    const { p } = setup();
    await expect(p.request('eth_getLogs', [{ fromBlock: '0x1', toBlock: '0x2' }], {})).rejects.toMatchObject({
      code: 'invalid_params',
    });
  });

  it('refuses eth_getLogs with more than five addresses', async () => {
    const { p } = setup(() => []);
    const address = Array.from({ length: 6 }, (_, i) => `0x${String(i).repeat(40)}`);
    await expect(p.request('eth_getLogs', [{ address, fromBlock: '0x1', toBlock: '0x2' }], {})).rejects.toMatchObject({
      code: 'invalid_params',
    });
  });

  it('refuses eth_getLogs over more than 10000 blocks', async () => {
    const { p, bodies } = setup((b) => (b.method === 'eth_blockNumber' ? '0x4e20' : []));
    await expect(
      p.request('eth_getLogs', [{ address: ADDR, fromBlock: '0x0', toBlock: 'latest' }], {}),
    ).rejects.toMatchObject({ code: 'invalid_params' });
    expect(bodies.some((b) => b.method === 'eth_getLogs')).toBe(false);
    // Exactly 10000 blocks back from latest is fine.
    await expect(
      p.request('eth_getLogs', [{ address: ADDR, fromBlock: '0x2710', toBlock: 'latest' }], {}),
    ).resolves.toEqual([]);
  });

  it('refuses eth_getLogs with earliest or without bounds', async () => {
    const { p } = setup(() => []);
    await expect(p.request('eth_getLogs', [{ address: ADDR, fromBlock: 'earliest', toBlock: '0x2' }], {})).rejects.toMatchObject({ code: 'invalid_params' });
    await expect(p.request('eth_getLogs', [{ address: ADDR, toBlock: '0x2' }], {})).rejects.toMatchObject({ code: 'invalid_params' });
    await expect(p.request('eth_getLogs', [{ address: ADDR, fromBlock: '0x1' }], {})).rejects.toMatchObject({ code: 'invalid_params' });
    await expect(p.request('eth_getLogs', [{ address: ADDR, fromBlock: '0x5', toBlock: '0x1' }], {})).rejects.toMatchObject({ code: 'invalid_params' });
  });

  it('accepts eth_getLogs by blockHash without an address', async () => {
    const { p } = setup(() => []);
    await expect(p.request('eth_getLogs', [{ blockHash: `0x${'a'.repeat(64)}` }], {})).resolves.toEqual([]);
  });

  it('refuses more than 1000 logs', async () => {
    const { p } = setup(() => Array.from({ length: RPC_LIMITS.logsMaxResults + 1 }, () => ({})));
    await expect(p.request('eth_getLogs', [{ address: ADDR, fromBlock: '0x1', toBlock: '0x2' }], {})).rejects.toMatchObject({
      code: 'rate_limited',
      message: 'Zu viele Ergebnisse. Grenze den Blockbereich ein.',
    });
  });

  it('forces eth_getBlockByNumber to return hashes only', async () => {
    const { p, bodies } = setup(() => ({}));
    await p.request('eth_getBlockByNumber', ['latest', true], {});
    expect(bodies[0].params[1]).toBe(false);
  });

  it('answers rate_limited after the burst and recovers with time', async () => {
    let t = 0;
    const { p } = setup(() => '0x1', () => t);
    for (let i = 0; i < RPC_LIMITS.burst; i++) await p.request('eth_blockNumber', [], {});
    await expect(p.request('eth_blockNumber', [], {})).rejects.toMatchObject({ code: 'rate_limited' });
    t += 1000;
    for (let i = 0; i < 5; i++) await p.request('eth_blockNumber', [], {});
    await expect(p.request('eth_blockNumber', [], {})).rejects.toMatchObject({ code: 'rate_limited' });
  });

  it('times out after 10 s', async () => {
    jest.useFakeTimers();
    try {
      let aborted = false;
      const never = jest.fn((_u: string, init: { signal: AbortSignal }) => {
        init.signal.addEventListener('abort', () => {
          aborted = true;
        });
        return new Promise(() => {});
      }) as unknown as typeof fetch;
      const p = createRpcProxy({ rpcUrl: 'https://rpc.test', fetch: never, now: () => 0 });
      const out = p.request('eth_blockNumber', [], {});
      const check = expect(out).rejects.toMatchObject({ code: 'timeout' });
      jest.advanceTimersByTime(RPC_LIMITS.timeoutMs);
      await check;
      expect(aborted).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('refuses a method that is not proxied', async () => {
    const { p, bodies } = setup();
    await expect(p.request('eth_sendRawTransaction', ['0x00'], {})).rejects.toMatchObject({ code: 'unsupported' });
    expect(bodies).toHaveLength(0);
  });

  it('refuses an oversized request and an oversized response', async () => {
    const { p } = setup(() => '0x1');
    const big = `0x${'ab'.repeat(RPC_LIMITS.maxRequestBytes)}`;
    await expect(p.request('eth_call', [{ to: ADDR, data: big }, 'latest'], {})).rejects.toMatchObject({ code: 'invalid_params' });
    const huge = setup(() => `0x${'00'.repeat(RPC_LIMITS.maxResponseBytes)}`);
    await expect(huge.p.request('eth_call', [{ to: ADDR }, 'latest'], {})).rejects.toMatchObject({ code: 'internal' });
  });

  it('passes an RPC error on with its code', async () => {
    const { p } = setup(() => ({ error: { code: 3, message: 'execution reverted' } }));
    await expect(p.request('eth_call', [{ to: ADDR }, 'latest'], {})).rejects.toEqual({
      code: 'internal',
      message: 'execution reverted',
      rpcCode: 3,
    });
  });
});
