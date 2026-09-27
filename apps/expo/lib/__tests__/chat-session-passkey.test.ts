/**
 * Chat on a passkey session: background API calls (polls, focus refreshes) never raise a
 * fingerprint prompt; the explicit start signs at most the one API-session message.
 */
const mockMem = new Map<string, string>();
jest.mock('@/lib/storage/secureStorage', () => ({
  getItemAsync: async (k: string) => mockMem.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => void mockMem.set(k, v),
  deleteItemAsync: async (k: string) => void mockMem.delete(k),
}));
jest.mock('@/lib/passkey/constants', () => ({ PASSKEY_API_URL: 'https://passkey.test' }));
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_a: string, s: string) => require('node:crypto').createHash('sha256').update(s).digest('hex'),
}));

import { ensureChatSession } from '../chat/session';

const passkeyAccount = () => ({
  address: '0xC49dE63CcfeE46C6C5c3E393293f66779799Fb28',
  signMessage: jest.fn(async () => '0x' + 'ab'.repeat(65)),
  __passkeySession: { credentialId: 'c', safe: '0x1', identity: '0xc49d' },
});

beforeEach(() => mockMem.clear());

it('background: no stored chat token and no API token → not_signed_in, NO prompt', async () => {
  const a = passkeyAccount();
  const fetchMock = jest.fn();
  (global as any).fetch = fetchMock;
  await expect(ensureChatSession(a, { background: true })).rejects.toMatchObject({ code: 'not_signed_in' });
  expect(a.signMessage).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
});

it('explicit start: one API-session signature, then the chat token comes from the session token', async () => {
  const a = passkeyAccount();
  const fetchMock = jest.fn(async (url: string, init: any) => {
    if (url.endsWith('/api/passkey/session')) return { ok: true, status: 200, json: async () => ({ enabled: true }) };
    if (url.endsWith('/api/passkey/session/start')) {
      const b = JSON.parse(init.body);
      return { ok: true, status: 200, json: async () => ({ token: 'pst1.t.m', jti: b.nonce, expiresAt: b.expiresAt }) };
    }
    if (url.endsWith('/api/chat/session')) {
      expect(init.headers.Authorization).toBe('Bearer pst1.t.m');
      expect(JSON.parse(init.body).signature).toBeUndefined();
      return { ok: true, status: 200, json: async () => ({ token: 'chat-jwt', expiresAt: new Date(Date.now() + 86400e3).toISOString() }) };
    }
    throw new Error(url);
  });
  (global as any).fetch = fetchMock;
  expect(await ensureChatSession(a)).toBe('chat-jwt');
  expect(a.signMessage).toHaveBeenCalledTimes(1);
  // a later forced background re-sign (after a 401) uses the cached API token: no prompt
  expect(await ensureChatSession(a, { force: true, background: true })).toBe('chat-jwt');
  expect(a.signMessage).toHaveBeenCalledTimes(1);
});
