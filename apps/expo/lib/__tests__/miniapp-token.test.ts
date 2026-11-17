/**
 * Mini-app user token: the host fetches it lazily, reuses it until shortly before expiry,
 * shares concurrent fetches, and backs off after a failure (no fingerprint-prompt loop).
 */
const mockMem = new Map<string, string>();
jest.mock('@/lib/storage/secureStorage', () => ({
  getItemAsync: async (k: string) => mockMem.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => void mockMem.set(k, v),
  deleteItemAsync: async (k: string) => void mockMem.delete(k),
}));
jest.mock('@/lib/passkey/constants', () => ({ PASSKEY_API_URL: '' }));
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_a: string, s: string) => require('node:crypto').createHash('sha256').update(s).digest('hex'),
}));

import { createMiniAppTokenCache, requestMiniAppUserToken, MINIAPP_SCOPE, type UserToken } from '../miniapp-token';

const W1 = '0xc49de63ccfee46c6c5c3e393293f66779799fb28';
const W2 = '0x1111111111111111111111111111111111111111';

describe('createMiniAppTokenCache', () => {
  it('reuses a token until 60 s before expiry', async () => {
    let now = 0;
    const request = jest.fn(async (): Promise<UserToken | null> => ({ token: `t${request.mock.calls.length}`, expiresAt: now + 600 }));
    const cache = createMiniAppTokenCache({ request, nowSec: () => now });
    expect(await cache.get('app', W1)).toBe('t1');
    expect(await cache.get('app', W1)).toBe('t1');
    expect(request).toHaveBeenCalledTimes(1);
    now = 539;
    expect(await cache.get('app', W1)).toBe('t1');
    expect(request).toHaveBeenCalledTimes(1);
    now = 541;
    expect(await cache.get('app', W1)).toBe('t2');
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('shares one request between concurrent gets', async () => {
    let resolve!: (v: UserToken | null) => void;
    const request = jest.fn(() => new Promise<UserToken | null>((r) => { resolve = r; }));
    const cache = createMiniAppTokenCache({ request, nowSec: () => 0 });
    const a = cache.get('app', W1);
    const b = cache.get('app', W1);
    resolve({ token: 'shared', expiresAt: 600 });
    expect(await a).toBe('shared');
    expect(await b).toBe('shared');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('does not retry for 60 s after a failure, then retries', async () => {
    let now = 100;
    const request = jest.fn(async (): Promise<UserToken | null> => null);
    const cache = createMiniAppTokenCache({ request, nowSec: () => now });
    expect(await cache.get('app', W1)).toBeNull();
    now = 159;
    expect(await cache.get('app', W1)).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
    now = 160;
    request.mockResolvedValueOnce({ token: 'later', expiresAt: 900 });
    expect(await cache.get('app', W1)).toBe('later');
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('treats a throwing request like a failure', async () => {
    const request = jest.fn(async (): Promise<UserToken | null> => { throw new Error('boom'); });
    const cache = createMiniAppTokenCache({ request, nowSec: () => 0 });
    expect(await cache.get('app', W1)).toBeNull();
    expect(await cache.get('app', W1)).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('keeps tokens of two wallets apart', async () => {
    const request = jest.fn(async (): Promise<UserToken | null> => ({ token: `t${request.mock.calls.length}`, expiresAt: 600 }));
    const cache = createMiniAppTokenCache({ request, nowSec: () => 0 });
    expect(await cache.get('app', W1)).toBe('t1');
    expect(await cache.get('app', W2)).toBe('t2');
    expect(await cache.get('app', W1)).toBe('t1');
    expect(await cache.get('other', W1)).toBe('t3');
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('clear() drops cached tokens and the failure back-off', async () => {
    const request = jest.fn(async (): Promise<UserToken | null> => null);
    const cache = createMiniAppTokenCache({ request, nowSec: () => 0 });
    expect(await cache.get('app', W1)).toBeNull();
    cache.clear();
    request.mockResolvedValueOnce({ token: 'fresh', expiresAt: 600 });
    expect(await cache.get('app', W1)).toBe('fresh');
    expect(request).toHaveBeenCalledTimes(2);
  });
});

describe('requestMiniAppUserToken', () => {
  const account = () => ({
    address: '0xC49dE63CcfeE46C6C5c3E393293f66779799Fb28',
    signMessage: jest.fn(async (_a: { message: string }) => '0x' + 'ab'.repeat(65)),
  });

  it('signs the canonical message and posts the signed body to /api/mini-apps/token', async () => {
    const a = account();
    const fetchMock = jest.fn(async (_url: string, _init: any) => ({ ok: true, status: 200, json: async () => ({ token: 'tok', expiresAt: 1234 }) }));
    (global as any).fetch = fetchMock;
    expect(await requestMiniAppUserToken(a, 'my-app')).toEqual({ token: 'tok', expiresAt: 1234 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/mini-apps\/token$/);
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ scope: MINIAPP_SCOPE, action: 'user_token', wallet: W1, payload: { app: 'my-app' } });
    const hash = require('node:crypto').createHash('sha256').update(JSON.stringify({ app: 'my-app' })).digest('hex');
    expect(a.signMessage).toHaveBeenCalledWith({ message: `roebel-miniapp-v1:user_token:${W1}:${body.timestampSec}:${hash}` });
    expect(body.signature).toBe('0x' + 'ab'.repeat(65));
  });

  it.each([401, 403, 404, 429, 503])('returns null on HTTP %i', async (status) => {
    (global as any).fetch = jest.fn(async () => ({ ok: false, status, json: async () => ({ ok: false, code: 'x' }) }));
    expect(await requestMiniAppUserToken(account(), 'my-app')).toBeNull();
  });

  it('returns null on a malformed 200 body', async () => {
    (global as any).fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ token: 5 }) }));
    expect(await requestMiniAppUserToken(account(), 'my-app')).toBeNull();
  });

  it('returns null when the signature is declined, without a request', async () => {
    const a = account();
    a.signMessage.mockRejectedValueOnce(new Error('cancelled'));
    const fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
    expect(await requestMiniAppUserToken(a, 'my-app')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null when offline', async () => {
    (global as any).fetch = jest.fn(async () => { throw new Error('Network request failed'); });
    expect(await requestMiniAppUserToken(account(), 'my-app')).toBeNull();
  });
});
