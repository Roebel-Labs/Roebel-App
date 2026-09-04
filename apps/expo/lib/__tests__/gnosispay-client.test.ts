/**
 * gpFetch is the single door to the Gnosis Pay API. Everything above it passes
 * a path, never a URL, and reads a discriminated GpResult rather than catching.
 * These tests pin that contract against a stubbed fetch.
 */
import { gpFetch } from '../gnosispay/client';

const originalFetch = global.fetch;

function stubFetch(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  }) as unknown as typeof fetch;
}

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe('gpFetch', () => {
  it('builds the URL from the configured base and returns parsed data', async () => {
    stubFetch(200, { id: 'user-1' });
    const result = await gpFetch<{ id: string }>('/api/v1/user', { token: 'jwt-1' });

    expect(result).toEqual({ ok: true, data: { id: 'user-1' } });
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.gnosispay.com/api/v1/user');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jwt-1');
  });

  it('omits the Authorization header when no token is given', async () => {
    stubFetch(200, {});
    await gpFetch('/api/v1/auth/nonce');

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('maps 401 to UNAUTHORIZED rather than throwing', async () => {
    stubFetch(401, { message: 'nope' });
    const result = await gpFetch('/api/v1/user', { token: 'stale' });

    expect(result).toEqual({ ok: false, code: 'UNAUTHORIZED', message: 'nope' });
  });

  it('maps 422 to KYC_REQUIRED so safe deploy can explain itself', async () => {
    stubFetch(422, { message: 'User is not KYC approved' });
    const result = await gpFetch('/api/v1/safe/deploy', { method: 'POST', token: 'jwt' });

    expect(result).toEqual({
      ok: false,
      code: 'KYC_REQUIRED',
      message: 'User is not KYC approved',
    });
  });

  it('maps 409 to ALREADY_DONE so idempotent steps can continue', async () => {
    stubFetch(409, { message: 'The user has already been approved' });
    const result = await gpFetch('/api/v1/kyc/integration', { token: 'jwt' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('ALREADY_DONE');
  });

  it('turns a network failure into NETWORK_ERROR, never a rejection', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const result = await gpFetch('/api/v1/user', { token: 'jwt' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NETWORK_ERROR');
  });

  it('survives a body that is not JSON', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 500,
      ok: false,
      json: async () => {
        throw new Error('not json');
      },
    }) as unknown as typeof fetch;

    const result = await gpFetch('/api/v1/user', { token: 'jwt' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('SERVER_ERROR');
      expect(result.message).toBe('HTTP 500');
    }
  });

  it('serialises a JSON body and sets the content type', async () => {
    stubFetch(200, {});
    await gpFetch('/api/v1/auth/signup', {
      method: 'POST',
      token: 'jwt',
      body: { authEmail: 'a@b.de', partnerId: 'p1' },
    });

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ authEmail: 'a@b.de', partnerId: 'p1' }));
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });
});
