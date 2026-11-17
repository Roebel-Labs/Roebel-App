jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_a: string, s: string) =>
    require('node:crypto').createHash('sha256').update(s).digest('hex'),
}));

import { credApi, fetchMine, reportSubmitted } from '../api';

const account = () => ({ address: '0xABC', signMessage: jest.fn(async () => '0x' + 'ab'.repeat(65)) });

describe('credApi', () => {
  afterEach(() => {
    delete (global as any).fetch;
  });

  it('signs under roebel-credentials-v1 and posts to /api/credentials/<route>', async () => {
    const acc = account();
    const fetchMock = jest.fn(async () => ({ status: 200, json: async () => ({ ok: true, data: [] }) }));
    (global as any).fetch = fetchMock;
    const res = await credApi<unknown[]>(acc, 'me', 'mine', {});
    expect(res).toEqual({ ok: true, data: [] });
    const [url, init] = fetchMock.mock.calls[0] as any;
    expect(url).toMatch(/\/api\/credentials\/me$/);
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ scope: 'roebel-credentials-v1', action: 'mine', wallet: '0xabc', payload: {} });
    const signed = (acc.signMessage.mock.calls[0] as any)[0].message as string;
    expect(signed.startsWith('roebel-credentials-v1:mine:0xabc:')).toBe(true);
  });

  it('typed wrappers pick their route and payload', async () => {
    const fetchMock = jest.fn(async () => ({ status: 200, json: async () => ({ ok: true, data: { status: 'done' } }) }));
    (global as any).fetch = fetchMock;
    await fetchMine(account());
    await reportSubmitted(account(), 'a1', '0x' + 'cd'.repeat(32));
    expect((fetchMock.mock.calls[0] as any)[0]).toMatch(/\/api\/credentials\/me$/);
    const [url, init] = fetchMock.mock.calls[1] as any;
    expect(url).toMatch(/\/api\/credentials\/actions$/);
    expect(JSON.parse(init.body)).toMatchObject({ action: 'action_submitted', payload: { actionId: 'a1', txHash: '0x' + 'cd'.repeat(32) } });
  });

  it('a network failure is { ok: false, code: "NETWORK_ERROR" } and never throws', async () => {
    (global as any).fetch = jest.fn(async () => {
      throw new Error('Network request failed');
    });
    const res = await credApi(account(), 'org', 'orgs_list', {});
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('NETWORK_ERROR');
  });
});
