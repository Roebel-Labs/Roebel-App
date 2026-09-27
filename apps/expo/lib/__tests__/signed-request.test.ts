jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_a: string, s: string) =>
    require('node:crypto').createHash('sha256').update(s).digest('hex'),
}));

import { buildSignedMessage, postSigned, SIGN_TIMEOUT_MS } from '../signed-request';

describe('signed-request', () => {
  it('builds the roebel-tickets-v1 message with sorted payload hash', async () => {
    const msg = await buildSignedMessage('checkout', '0xABC', 1700000000, { b: 2, a: 'x' });
    expect(msg).toMatch(/^roebel-tickets-v1:checkout:0xabc:1700000000:[0-9a-f]{64}$/);
    expect(msg).toBe(await buildSignedMessage('checkout', '0xabc', 1700000000, { a: 'x', b: 2 }));
  });

  it('posts the signed body and unwraps the envelope', async () => {
    const account = { address: '0xABC', signMessage: jest.fn(async () => '0x' + 'ab'.repeat(65)) };
    const fetchMock = jest.fn(async () => ({ json: async () => ({ ok: true, data: { hello: 1 } }) }));
    (global as any).fetch = fetchMock;
    const res = await postSigned<{ hello: number }>('/api/tickets/order', account, 'order_status', { order_id: 'o1' });
    expect(res).toEqual({ ok: true, data: { hello: 1 } });
    const [url, init] = fetchMock.mock.calls[0] as any;
    expect(url).toMatch(/\/api\/tickets\/order$/);
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ scope: 'roebel-tickets-v1', action: 'order_status', wallet: '0xabc', payload: { order_id: 'o1' } });
    expect(body.signature).toMatch(/^0x/);
  });
});

describe('postSigned signature queue', () => {
  beforeEach(() => {
    (global as any).fetch = jest.fn(async () => ({ json: async () => ({ ok: true, data: null }) }));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('signs concurrent requests one at a time', async () => {
    let active = 0;
    let maxActive = 0;
    const account = {
      address: '0xabc',
      signMessage: jest.fn(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 5));
        active -= 1;
        return '0x' + 'ab'.repeat(65);
      }),
    };
    const results = await Promise.all([
      postSigned('/a', account, 'ticket_types_list', {}),
      postSigned('/b', account, 'connect_status', {}),
      postSigned('/c', account, 'orders_list', {}),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(account.signMessage).toHaveBeenCalledTimes(3);
    expect(maxActive).toBe(1);
  });

  it('fails a signature that never returns and keeps the queue moving', async () => {
    jest.useFakeTimers();
    const hanging = { address: '0xabc', signMessage: jest.fn(() => new Promise<string>(() => {})) };
    const working = { address: '0xabc', signMessage: jest.fn(async () => '0x' + 'cd'.repeat(65)) };
    const stuck = postSigned('/a', hanging, 'ticket_types_list', {});
    const next = postSigned('/b', working, 'connect_status', {});
    await jest.advanceTimersByTimeAsync(SIGN_TIMEOUT_MS + 10);
    await expect(stuck).resolves.toMatchObject({ ok: false, code: 'SIGN_FAILED' });
    await expect(next).resolves.toMatchObject({ ok: true });
  });
});

describe('signed-request on a passkey session (API session token)', () => {
  const PASSKEY_SESSION_PROP = '__passkeySession';
  const mem = new Map<string, string>();
  beforeAll(() => {
    jest.resetModules();
  });

  it('uses the session token (one signature per device session) instead of a signature per request', async () => {
    jest.doMock('@/lib/storage/secureStorage', () => ({
      getItemAsync: async (k: string) => mem.get(k) ?? null,
      setItemAsync: async (k: string, v: string) => void mem.set(k, v),
      deleteItemAsync: async (k: string) => void mem.delete(k),
    }));
    jest.doMock('@/lib/passkey/constants', () => ({ PASSKEY_API_URL: 'https://passkey.test' }));
    const { postSigned: post } = require('../signed-request');
    const account = {
      address: '0xC49dE63CcfeE46C6C5c3E393293f66779799Fb28',
      signMessage: jest.fn(async () => '0x' + 'ab'.repeat(65)),
      [PASSKEY_SESSION_PROP]: { credentialId: 'c', safe: '0x1', identity: '0xc49d' },
    };
    const fetchMock = jest.fn(async (url: string, init: any) => {
      if (url === 'https://passkey.test/api/passkey/session') return { ok: true, status: 200, json: async () => ({ enabled: true }) };
      if (url === 'https://passkey.test/api/passkey/session/start') {
        const b = JSON.parse(init.body);
        return { ok: true, status: 200, json: async () => ({ token: 'pst1.t.m', jti: b.nonce, expiresAt: b.expiresAt }) };
      }
      return { ok: true, status: 200, json: async () => ({ ok: true, data: { n: 1 } }) };
    });
    (global as any).fetch = fetchMock;
    for (let i = 0; i < 3; i++) {
      expect(await post('/api/tickets/mine', account, 'tickets_list', {})).toEqual({ ok: true, data: { n: 1 } });
    }
    expect(account.signMessage).toHaveBeenCalledTimes(1);
    const ticketCalls = fetchMock.mock.calls.filter((c: any) => String(c[0]).endsWith('/api/tickets/mine'));
    expect(ticketCalls).toHaveLength(3);
    for (const [, init] of ticketCalls as any) {
      expect(init.headers.Authorization).toBe('Bearer pst1.t.m');
      expect(init.headers['x-roebel-device']).toMatch(/^[0-9a-f]{32}$/);
      expect(JSON.parse(init.body).signature).toBeUndefined();
    }
    // refunds always carry a fresh signature
    await post('/api/tickets/refund', account, 'refund_order', { order_id: 'o' });
    expect(account.signMessage).toHaveBeenCalledTimes(2);
    const refund = fetchMock.mock.calls.find((c: any) => String(c[0]).endsWith('/api/tickets/refund')) as any;
    expect(JSON.parse(refund[1].body).signature).toMatch(/^0x/);
  });
});
