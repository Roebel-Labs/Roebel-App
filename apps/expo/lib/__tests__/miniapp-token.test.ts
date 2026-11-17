/**
 * Mini-app user token: the host fetches it lazily, reuses it until shortly before expiry,
 * shares concurrent fetches, backs off after a failure (no fingerprint-prompt loop), and a
 * silent read never prompts.
 */
import { createHash } from 'node:crypto';
import {
  createMiniAppTokenCache,
  requestMiniAppUserToken,
  resolveMiniAppUserToken,
  MINIAPP_SCOPE,
  type MiniAppTokenCache,
  type UserToken,
} from '../miniapp-token';
import { PASSKEY_API_SESSION_KEY } from '../passkey/api-session';

const mockMem = new Map<string, string>();
jest.mock('@/lib/storage/secureStorage', () => ({
  getItemAsync: async (k: string) => mockMem.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => void mockMem.set(k, v),
  deleteItemAsync: async (k: string) => void mockMem.delete(k),
}));
jest.mock('@/lib/passkey/constants', () => ({ PASSKEY_API_URL: 'https://passkey.test' }));
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_a: string, s: string) =>
    jest.requireActual('node:crypto').createHash('sha256').update(s).digest('hex'),
}));

const W1 = '0xc49de63ccfee46c6c5c3e393293f66779799fb28';
const W2 = '0x1111111111111111111111111111111111111111';
const SIG = '0x' + 'ab'.repeat(65);

beforeEach(() => mockMem.clear());

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

  it('passes the wallet and the mode to the request', async () => {
    const request = jest.fn(async (): Promise<UserToken | null> => null);
    const cache = createMiniAppTokenCache({ request, nowSec: () => 0 });
    await cache.get('app', W1, { silent: true });
    expect(request).toHaveBeenCalledWith('app', { wallet: W1, silent: true });
  });

  it('shares one request between concurrent gets', async () => {
    let resolve!: (v: UserToken | null) => void;
    const request = jest.fn(() => new Promise<UserToken | null>((r) => { resolve = r; }));
    const cache = createMiniAppTokenCache({ request, nowSec: () => 0 });
    const a = cache.get('app', W1);
    const b = cache.get('app', W1);
    const c = cache.get('app', W1, { silent: true });
    resolve({ token: 'shared', expiresAt: 600 });
    expect(await a).toBe('shared');
    expect(await b).toBe('shared');
    expect(await c).toBe('shared');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('does not retry for 60 s after a failure, then retries', async () => {
    let now = 100;
    const request = jest.fn(async (): Promise<UserToken | null> => null);
    const cache = createMiniAppTokenCache({ request, nowSec: () => now });
    expect(await cache.get('app', W1)).toBeNull();
    now = 159;
    expect(await cache.get('app', W1)).toBeNull();
    expect(await cache.get('app', W1, { silent: true })).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
    now = 160;
    request.mockResolvedValueOnce({ token: 'later', expiresAt: 900 });
    expect(await cache.get('app', W1)).toBe('later');
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('a failed silent request holds back silent requests only', async () => {
    const request = jest.fn(async (): Promise<UserToken | null> => null);
    const cache = createMiniAppTokenCache({ request, nowSec: () => 0 });
    expect(await cache.get('app', W1, { silent: true })).toBeNull();
    expect(await cache.get('app', W1, { silent: true })).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
    request.mockResolvedValueOnce({ token: 'write', expiresAt: 600 });
    expect(await cache.get('app', W1)).toBe('write');
    expect(request).toHaveBeenLastCalledWith('app', { wallet: W1, silent: false });
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

  it('peek returns a valid cached token and never requests', async () => {
    let now = 0;
    const request = jest.fn(async (): Promise<UserToken | null> => ({ token: 'tok', expiresAt: 600 }));
    const cache = createMiniAppTokenCache({ request, nowSec: () => now });
    expect(cache.peek('app', W1)).toBeNull();
    expect(request).not.toHaveBeenCalled();
    await cache.get('app', W1);
    expect(cache.peek('app', W1)).toBe('tok');
    now = 541;
    expect(cache.peek('app', W1)).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
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

describe('resolveMiniAppUserToken', () => {
  const fakeCache = (peeked: string | null = null) => ({
    peek: jest.fn(() => peeked),
    get: jest.fn(async () => 'fetched'),
    clear: jest.fn(),
  }) satisfies MiniAppTokenCache;
  const base = { appId: 'app', wallet: W1, hasApi: true, silent: false };

  it('the dev preview, a missing wallet or a missing API never request', async () => {
    for (const over of [{ appId: 'dev-preview' }, { wallet: null }, { hasApi: false }]) {
      const cache = fakeCache('cached');
      expect(await resolveMiniAppUserToken({ ...base, ...over, cache, canSignSilently: async () => true })).toBeNull();
      expect(cache.get).not.toHaveBeenCalled();
    }
  });

  it('uses a valid cached token before the silent gate', async () => {
    const cache = fakeCache('cached');
    const canSignSilently = jest.fn(async () => false);
    expect(await resolveMiniAppUserToken({ ...base, silent: true, cache, canSignSilently })).toBe('cached');
    expect(canSignSilently).not.toHaveBeenCalled();
    expect(cache.get).not.toHaveBeenCalled();
  });

  it('silent with no silent path → null without calling request', async () => {
    const request = jest.fn(async (): Promise<UserToken | null> => ({ token: 'x', expiresAt: 600 }));
    const cache = createMiniAppTokenCache({ request, nowSec: () => 0 });
    expect(await resolveMiniAppUserToken({ ...base, silent: true, cache, canSignSilently: async () => false })).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });

  it('silent with a silent path, and every write, go to the cache', async () => {
    const cache = fakeCache();
    expect(await resolveMiniAppUserToken({ ...base, silent: true, cache, canSignSilently: async () => true })).toBe('fetched');
    expect(cache.get).toHaveBeenLastCalledWith('app', W1, { silent: true });
    const canSignSilently = jest.fn(async () => false);
    expect(await resolveMiniAppUserToken({ ...base, cache, canSignSilently })).toBe('fetched');
    expect(cache.get).toHaveBeenLastCalledWith('app', W1, { silent: false });
    expect(canSignSilently).not.toHaveBeenCalled();
  });
});

describe('requestMiniAppUserToken', () => {
  const account = () => ({
    address: '0xC49dE63CcfeE46C6C5c3E393293f66779799Fb28',
    signMessage: jest.fn(async (_a: { message: string }) => SIG),
  });
  const passkeyAccount = () => ({ ...account(), __passkeySession: { credentialId: 'c', safe: '0x1', identity: W1 } });
  const storeSessionToken = () =>
    mockMem.set(PASSKEY_API_SESSION_KEY, JSON.stringify({
      deviceId: 'dev0123456789abcdef', identity: W1, token: 'pst1.t.m', jti: 'j', expiresAt: Math.floor(Date.now() / 1000) + 3600,
    }));

  it('signs the canonical message and posts the signed body to /api/mini-apps/token', async () => {
    const a = account();
    const fetchMock = jest.fn(async (_url: string, _init: { body: string }) => ({ ok: true, status: 200, json: async () => ({ token: 'tok', expiresAt: 1234 }) }));
    (global as any).fetch = fetchMock;
    expect(await requestMiniAppUserToken(a, 'my-app')).toEqual({ token: 'tok', expiresAt: 1234 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/mini-apps\/token$/);
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ scope: MINIAPP_SCOPE, action: 'user_token', wallet: W1, payload: { app: 'my-app' } });
    const hash = createHash('sha256').update(JSON.stringify({ app: 'my-app' })).digest('hex');
    expect(a.signMessage).toHaveBeenCalledWith({ message: `roebel-miniapp-v1:user_token:${W1}:${body.timestampSec}:${hash}` });
    expect(body.signature).toBe(SIG);
  });

  it('silent on a non-passkey account still uses its (silent) wallet signature', async () => {
    const a = account();
    (global as any).fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ token: 'tok', expiresAt: 1234 }) }));
    expect(await requestMiniAppUserToken(a, 'my-app', { silent: true })).toEqual({ token: 'tok', expiresAt: 1234 });
    expect(a.signMessage).toHaveBeenCalledTimes(1);
  });

  it('returns null when the signer is not the requested wallet', async () => {
    const a = account();
    const fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
    expect(await requestMiniAppUserToken(a, 'my-app', { wallet: W2 })).toBeNull();
    expect(a.signMessage).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
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

  describe('silent on a passkey account (never a fingerprint)', () => {
    it('without a session token → null, no prompt, no request', async () => {
      const a = passkeyAccount();
      const fetchMock = jest.fn();
      (global as any).fetch = fetchMock;
      expect(await requestMiniAppUserToken(a, 'my-app', { silent: true })).toBeNull();
      expect(a.signMessage).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('with a session token → the token route answers with the session headers, no prompt', async () => {
      storeSessionToken();
      const a = passkeyAccount();
      const fetchMock = jest.fn(async (_url: string, init: { headers: Record<string, string>; body: string }) => {
        expect(init.headers.Authorization).toBe('Bearer pst1.t.m');
        expect(JSON.parse(init.body).signature).toBeUndefined();
        return { ok: true, status: 200, json: async () => ({ token: 'tok', expiresAt: 1234 }) };
      });
      (global as any).fetch = fetchMock;
      expect(await requestMiniAppUserToken(a, 'my-app', { silent: true })).toEqual({ token: 'tok', expiresAt: 1234 });
      expect(a.signMessage).not.toHaveBeenCalled();
    });

    it('session token rejected → null, no prompt, token forgotten', async () => {
      storeSessionToken();
      const a = passkeyAccount();
      const fetchMock = jest.fn(async () => ({ ok: false, status: 401, json: async () => ({ ok: false, code: 'SESSION_INVALID' }) }));
      (global as any).fetch = fetchMock;
      expect(await requestMiniAppUserToken(a, 'my-app', { silent: true })).toBeNull();
      expect(a.signMessage).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(JSON.parse(mockMem.get(PASSKEY_API_SESSION_KEY)!).token).toBeUndefined();
    });

    it('session expired/missing between check and request → no new session is minted', async () => {
      mockMem.set(PASSKEY_API_SESSION_KEY, JSON.stringify({
        deviceId: 'dev0123456789abcdef', identity: W1, token: 'pst1.t.m', jti: 'j', expiresAt: Math.floor(Date.now() / 1000) + 30,
      }));
      const a = passkeyAccount();
      const fetchMock = jest.fn();
      (global as any).fetch = fetchMock;
      expect(await requestMiniAppUserToken(a, 'my-app', { silent: true })).toBeNull();
      expect(a.signMessage).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    // Last: marks the endpoint unsupported for this module instance.
    it('server ignores session tokens (unsupported) → null, no prompt, now and on the next try', async () => {
      storeSessionToken();
      const a = passkeyAccount();
      const fetchMock = jest.fn(async () => ({ ok: false, status: 401, json: async () => ({ ok: false, code: 'BAD_SIGNATURE' }) }));
      (global as any).fetch = fetchMock;
      expect(await requestMiniAppUserToken(a, 'my-app', { silent: true })).toBeNull();
      expect(await requestMiniAppUserToken(a, 'my-app', { silent: true })).toBeNull();
      expect(a.signMessage).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
