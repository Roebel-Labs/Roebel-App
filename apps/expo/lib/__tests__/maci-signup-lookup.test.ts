import {
  SIGN_UP_TOPIC0,
  buildExplorerSignUpUrl,
  findSignUpStateIndex,
  lookupSignUpViaExplorer,
  lookupSignUpViaRpcScan,
  parseExplorerSignUpResponse,
  resolveSignUpWithRecovery,
  type LookupResult,
} from '../maci-signup-lookup';

const MACI = '0x6663eDC8650276fe264710B1A2ba46eB8bd0bF1D';
// Real SignUp #19 (tx 0x06bf8bb1…, 2026-07-20).
const PUB_X = 0x1897d73b208e8d6b79f6d943d928558c7ad447482ab2424449d565bce5575fe3n;
const PUB_Y = 0x2608ed4e5c28f76465ed3db4a80f9345835ff99356f41b8690613edb1b68eacen;

const realResponse = {
  message: 'OK',
  status: '1',
  result: [
    {
      address: MACI.toLowerCase(),
      blockNumber: '0x2d1bc08',
      data:
        '0x0000000000000000000000000000000000000000000000000000000000000013' +
        '0000000000000000000000000000000000000000000000000000000000000001' +
        '000000000000000000000000000000000000000000000000000000006a5e15f4',
      topics: [
        SIGN_UP_TOPIC0,
        '0x1897d73b208e8d6b79f6d943d928558c7ad447482ab2424449d565bce5575fe3',
        '0x2608ed4e5c28f76465ed3db4a80f9345835ff99356f41b8690613edb1b68eace',
        null,
      ],
    },
  ],
};

describe('parseExplorerSignUpResponse', () => {
  it('reads stateIndex from the first data word of a matching log', () => {
    expect(parseExplorerSignUpResponse(realResponse, PUB_X, PUB_Y, MACI)).toEqual({
      kind: 'found',
      stateIndex: 19n,
    });
  });

  it('treats "No logs found" as a clean not-found', () => {
    expect(
      parseExplorerSignUpResponse({ message: 'No logs found', result: [], status: '0' }, PUB_X, PUB_Y, MACI),
    ).toEqual({ kind: 'not-found' });
  });

  it('treats rate limits / garbage as errors, never as not-found', () => {
    expect(parseExplorerSignUpResponse({ message: 'NOTOK', result: 'Max rate limit reached', status: '0' }, PUB_X, PUB_Y, MACI).kind).toBe('error');
    expect(parseExplorerSignUpResponse({ message: 'NOTOK', result: [], status: '0' }, PUB_X, PUB_Y, MACI).kind).toBe('error');
    expect(parseExplorerSignUpResponse(null, PUB_X, PUB_Y, MACI).kind).toBe('error');
  });

  it('treats non-matching logs (filter ignored) as an error', () => {
    expect(parseExplorerSignUpResponse(realResponse, PUB_X, 1n, MACI).kind).toBe('error');
    expect(parseExplorerSignUpResponse(realResponse, PUB_X, PUB_Y, '0x0000000000000000000000000000000000000001').kind).toBe('error');
  });

  it('builds a topic-filtered URL with padded pubkey topics', () => {
    const url = buildExplorerSignUpUrl('https://x/api', { maciAddress: MACI, fromBlock: 46867703n, pubX: 5n, pubY: PUB_Y });
    expect(url).toContain(`topic0=${SIGN_UP_TOPIC0}`);
    expect(url).toContain('topic1=0x' + '0'.repeat(63) + '5');
    expect(url).toContain('topic2=0x2608ed4e');
    expect(url).toContain('topic1_2_opr=and');
    expect(url).toContain('fromBlock=46867703');
  });
});

describe('lookupSignUpViaExplorer', () => {
  const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

  it('returns the first conclusive host answer', async () => {
    const fetchImpl = jest.fn(async () => ok(realResponse));
    const res = await lookupSignUpViaExplorer({ pubX: PUB_X, pubY: PUB_Y, maciAddress: MACI, fromBlock: 1n, fetchImpl });
    expect(res).toEqual({ kind: 'found', stateIndex: 19n });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('tries the next host on http/network errors, errors when all fail', async () => {
    const fetchImpl = jest
      .fn()
      .mockRejectedValueOnce(new Error('aborted'))
      .mockResolvedValueOnce({ ok: false, status: 502, json: async () => ({}) });
    const res = await lookupSignUpViaExplorer({ pubX: PUB_X, pubY: PUB_Y, maciAddress: MACI, fromBlock: 1n, fetchImpl });
    expect(res.kind).toBe('error');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('aborts a hanging request after the timeout', async () => {
    const fetchImpl = jest.fn(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise<never>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))),
    );
    const res = await lookupSignUpViaExplorer({
      pubX: PUB_X, pubY: PUB_Y, maciAddress: MACI, fromBlock: 1n, fetchImpl, timeoutMs: 10, urls: ['https://x/api'],
    });
    expect(res.kind).toBe('error');
  });
});

describe('findSignUpStateIndex', () => {
  it('uses the explorer answer without touching RPC', async () => {
    const rpcScan = jest.fn();
    const res = await findSignUpStateIndex(1n, 2n, {
      explorer: async () => ({ kind: 'not-found' }),
      rpcScan,
    });
    expect(res).toEqual({ kind: 'not-found' });
    expect(rpcScan).not.toHaveBeenCalled();
  });

  it('falls back to the RPC scan when the explorer fails', async () => {
    const rpcScan = jest.fn(async (): Promise<LookupResult> => ({ kind: 'found', stateIndex: 7n }));
    const res = await findSignUpStateIndex(1n, 2n, {
      explorer: async () => ({ kind: 'error', reason: 'down' }),
      rpcScan,
    });
    expect(res).toEqual({ kind: 'found', stateIndex: 7n });
    expect(rpcScan).toHaveBeenCalledWith(1n, 2n);
  });

  it('stays an error only if both fail', async () => {
    const res = await findSignUpStateIndex(1n, 2n, {
      explorer: async () => ({ kind: 'error', reason: 'down' }),
      rpcScan: async () => ({ kind: 'error', reason: 'rpc down' }),
    });
    expect(res.kind).toBe('error');
  });
});

describe('lookupSignUpViaRpcScan', () => {
  const sleep = async () => undefined;

  it('retries a flaky window up to 3 times with concurrency 2', async () => {
    let active = 0;
    let maxActive = 0;
    const calls = new Map<string, number>();
    const res = await lookupSignUpViaRpcScan({
      fromBlock: 0n,
      windowSize: 10n,
      tryFullRangeFirst: false,
      getLatestBlock: async () => 99n,
      sleep,
      getSignUpInWindow: async (from) => {
        active++;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        active--;
        const n = (calls.get(String(from)) ?? 0) + 1;
        calls.set(String(from), n);
        if (from === 50n && n < 3) throw new Error('flaky');
        return null;
      },
    });
    expect(res).toEqual({ kind: 'not-found' });
    expect(calls.get('50')).toBe(3);
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it('reports an error when a window fails every attempt', async () => {
    const res = await lookupSignUpViaRpcScan({
      fromBlock: 0n, windowSize: 10n, getLatestBlock: async () => 29n, sleep, tryFullRangeFirst: false,
      getSignUpInWindow: async (from) => {
        if (from === 10n) throw new Error('dead');
        return null;
      },
    });
    expect(res.kind).toBe('error');
  });

  it('answers with one full-range request when the node allows it', async () => {
    const getSignUpInWindow = jest.fn(async () => null);
    const res = await lookupSignUpViaRpcScan({ fromBlock: 0n, windowSize: 10n, getLatestBlock: async () => 99n, sleep, getSignUpInWindow });
    expect(res).toEqual({ kind: 'not-found' });
    expect(getSignUpInWindow).toHaveBeenCalledTimes(1);
    expect(getSignUpInWindow).toHaveBeenCalledWith(0n, 99n);
  });

  it('falls back to windows when the full range is rejected', async () => {
    const getSignUpInWindow = jest.fn(async (from: bigint, to: bigint) => {
      if (to - from > 10n) throw new Error('range too large');
      return from === 20n ? 9n : null;
    });
    const res = await lookupSignUpViaRpcScan({ fromBlock: 0n, windowSize: 10n, getLatestBlock: async () => 29n, sleep, getSignUpInWindow });
    expect(res).toEqual({ kind: 'found', stateIndex: 9n });
  });

  it('returns the hit', async () => {
    const res = await lookupSignUpViaRpcScan({
      fromBlock: 0n, windowSize: 10n, getLatestBlock: async () => 29n, sleep, tryFullRangeFirst: false,
      getSignUpInWindow: async (from) => (from === 0n ? 4n : null),
    });
    expect(res).toEqual({ kind: 'found', stateIndex: 4n });
  });
});

describe('resolveSignUpWithRecovery', () => {
  const current = { pubX: 1n, pubY: 1n };
  const legacyA = { pubX: 2n, pubY: 2n, tag: 'raw' };
  const legacyB = { pubX: 3n, pubY: 3n, tag: '6492' };
  const lookupFrom = (table: Record<string, LookupResult>) =>
    jest.fn(async (x: bigint, y: bigint): Promise<LookupResult> => table[`${x}:${y}`] ?? { kind: 'not-found' });

  it('uses the current key when it is registered (no token read, no derivation)', async () => {
    const isTokenRegistered = jest.fn();
    const deriveLegacyCandidates = jest.fn();
    const out = await resolveSignUpWithRecovery({
      current,
      lookup: lookupFrom({ '1:1': { kind: 'found', stateIndex: 3n } }),
      isTokenRegistered,
      deriveLegacyCandidates,
    });
    expect(out).toEqual({ kind: 'current', stateIndex: 3n });
    expect(isTokenRegistered).not.toHaveBeenCalled();
    expect(deriveLegacyCandidates).not.toHaveBeenCalled();
  });

  it('is unknown when the current lookup fails', async () => {
    const out = await resolveSignUpWithRecovery({
      current,
      lookup: lookupFrom({ '1:1': { kind: 'error', reason: 'x' } }),
      isTokenRegistered: async () => true,
      deriveLegacyCandidates: jest.fn(),
    });
    expect(out.kind).toBe('unknown');
  });

  it('needs-signup when the token is not registered (no derivation)', async () => {
    const deriveLegacyCandidates = jest.fn();
    const out = await resolveSignUpWithRecovery({
      current,
      lookup: lookupFrom({}),
      isTokenRegistered: async () => false,
      deriveLegacyCandidates,
    });
    expect(out).toEqual({ kind: 'needs-signup' });
    expect(deriveLegacyCandidates).not.toHaveBeenCalled();
  });

  it('adopts the legacy key when the token is registered and a legacy key has a SignUp', async () => {
    const out = await resolveSignUpWithRecovery({
      current,
      lookup: lookupFrom({ '3:3': { kind: 'found', stateIndex: 19n } }),
      isTokenRegistered: async () => true,
      deriveLegacyCandidates: async () => [legacyA, legacyB],
    });
    expect(out).toEqual({ kind: 'legacy', key: legacyB, stateIndex: 19n });
  });

  it('AlreadyRegistered skips the token read and recovers', async () => {
    const isTokenRegistered = jest.fn();
    const out = await resolveSignUpWithRecovery({
      current,
      lookup: lookupFrom({ '2:2': { kind: 'found', stateIndex: 5n } }),
      isTokenRegistered,
      deriveLegacyCandidates: async () => [legacyA, legacyB],
      alreadyRegistered: true,
    });
    expect(out).toEqual({ kind: 'legacy', key: legacyA, stateIndex: 5n });
    expect(isTokenRegistered).not.toHaveBeenCalled();
  });

  it('lost-key when no legacy candidate has a SignUp', async () => {
    const out = await resolveSignUpWithRecovery({
      current,
      lookup: lookupFrom({}),
      isTokenRegistered: async () => true,
      deriveLegacyCandidates: async () => [legacyA, legacyB],
    });
    expect(out).toEqual({ kind: 'lost-key' });
  });

  it('unknown (retryable) when derivation or a legacy lookup fails', async () => {
    const failDerive = await resolveSignUpWithRecovery({
      current,
      lookup: lookupFrom({}),
      isTokenRegistered: async () => true,
      deriveLegacyCandidates: async () => {
        throw new Error('autoConnect failed');
      },
    });
    expect(failDerive.kind).toBe('unknown');
    const failLookup = await resolveSignUpWithRecovery({
      current,
      lookup: lookupFrom({ '2:2': { kind: 'error', reason: 'down' } }),
      isTokenRegistered: async () => true,
      deriveLegacyCandidates: async () => [legacyA, legacyB],
    });
    expect(failLookup.kind).toBe('unknown');
  });

  it('a failed token read degrades to needs-signup (signUp then hits AlreadyRegistered)', async () => {
    const out = await resolveSignUpWithRecovery({
      current,
      lookup: lookupFrom({}),
      isTokenRegistered: async () => {
        throw new Error('rpc');
      },
      deriveLegacyCandidates: jest.fn(),
    });
    expect(out).toEqual({ kind: 'needs-signup' });
  });
});
