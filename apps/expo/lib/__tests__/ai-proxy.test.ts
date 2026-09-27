const mockEnsureChatSession = jest.fn();
const mockClearChatSession = jest.fn();
jest.mock('@/lib/chat/session', () => ({
  ensureChatSession: (...args: unknown[]) => mockEnsureChatSession(...args),
  clearChatSession: (...args: unknown[]) => mockClearChatSession(...args),
}));
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async () => '',
}));

import {
  AiAuthError, ANTHROPIC_PROXY_PATH, createAnthropicMessage, getCurrentAiAccount, invalidateAiSession,
  MENU_IMAGE_PATH, postAi, setCurrentAiAccount,
} from '../ai/proxy';
import { regenerateMenuItemImage } from '../generate-menu-image-client';

const account = { address: '0xAbC0000000000000000000000000000000000001', signMessage: jest.fn(async () => '0xsig') };
const BASE = 'https://www.roebel.app';

function response(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

let fetchMock: jest.Mock;
beforeEach(() => {
  mockEnsureChatSession.mockReset();
  mockClearChatSession.mockReset();
  mockEnsureChatSession.mockImplementation(async (_acc, opts) => (opts?.force ? 'fresh-token' : 'stored-token'));
  fetchMock = jest.fn();
  (globalThis as any).fetch = fetchMock;
});

describe('postAi', () => {
  it('sends the body to the web route with the chat-session Bearer token and no provider key', async () => {
    fetchMock.mockResolvedValueOnce(response(200, { id: 'msg' }));
    const body = { model: 'claude-haiku-4-5', max_tokens: 10, messages: [{ role: 'user', content: 'Hi' }] };
    await postAi(ANTHROPIC_PROXY_PATH, account, body);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/ai/anthropic`);
    expect(init.headers.Authorization).toBe('Bearer stored-token');
    expect(init.headers['x-api-key']).toBeUndefined();
    expect(JSON.parse(init.body)).toEqual(body);
  });

  it('re-signs once and retries when the server answers 401', async () => {
    fetchMock.mockResolvedValueOnce(response(401, {})).mockResolvedValueOnce(response(200, { ok: true }));
    const res = await postAi(ANTHROPIC_PROXY_PATH, account, {});
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer fresh-token');
    expect(mockEnsureChatSession).toHaveBeenLastCalledWith(account, { force: true });
  });

  it('refuses without a signed-in account (no request leaves the app)', async () => {
    await expect(postAi(ANTHROPIC_PROXY_PATH, null, {})).rejects.toBeInstanceOf(AiAuthError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('createAnthropicMessage', () => {
  it('returns the Anthropic JSON unchanged', async () => {
    const payload = { content: [{ type: 'text', text: 'Hallo' }] };
    fetchMock.mockResolvedValueOnce(response(200, payload));
    await expect(createAnthropicMessage(account, { model: 'claude-haiku-4-5' })).resolves.toEqual(payload);
  });

  it('throws the server error message (rate limit etc.)', async () => {
    fetchMock.mockResolvedValueOnce(response(429, { type: 'error', error: { type: 'rate_limit_error', message: 'Zu viele Anfragen.' } }));
    await expect(createAnthropicMessage(account, {})).rejects.toThrow('Zu viele Anfragen.');
  });
});

describe('AI account registry + session invalidation', () => {
  it('keeps the current chat account for tool executors', () => {
    setCurrentAiAccount(account);
    expect(getCurrentAiAccount()).toBe(account);
    setCurrentAiAccount(null);
    expect(getCurrentAiAccount()).toBeNull();
  });

  it('clears the stored session for the account', async () => {
    await invalidateAiSession(account);
    expect(mockClearChatSession).toHaveBeenCalledWith(account.address);
  });
});

describe('regenerateMenuItemImage', () => {
  it('goes through /api/ai/menu-image with the same payload and no seed token', async () => {
    fetchMock.mockResolvedValueOnce(response(200, { ok: true, image_url: 'https://img/x.jpg', prompt: 'p' }));
    const input = { menu_item_id: '11111111-2222-3333-4444-555555555555', prompt_hint: 'knusprig' };
    const result = await regenerateMenuItemImage(account, input);
    expect(result).toEqual({ ok: true, image_url: 'https://img/x.jpg', prompt: 'p' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}${MENU_IMAGE_PATH}`);
    expect(init.headers['x-seed-token']).toBeUndefined();
    expect(init.headers.Authorization).toBe('Bearer stored-token');
    expect(JSON.parse(init.body)).toEqual(input);
  });

  it('maps a missing account and a non-JSON answer to error codes', async () => {
    await expect(regenerateMenuItemImage(null, { menu_item_id: 'x' })).resolves.toMatchObject({ ok: false, code: 'NOT_SIGNED_IN' });
    fetchMock.mockResolvedValueOnce({ ok: false, status: 502, json: async () => { throw new Error('html'); } });
    await expect(regenerateMenuItemImage(account, { menu_item_id: 'x' })).resolves.toEqual({ ok: false, code: 'HTTP_502' });
  });

  it('passes server error codes through (403 not your menu, 429 rate limit)', async () => {
    fetchMock.mockResolvedValueOnce(response(403, { ok: false, code: 'FORBIDDEN' }));
    await expect(regenerateMenuItemImage(account, { menu_item_id: 'x' })).resolves.toEqual({ ok: false, code: 'FORBIDDEN' });
  });
});
