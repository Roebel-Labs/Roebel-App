import { afterEach, describe, expect, it, vi } from 'vitest';
import { CredentialsApiError, credCall, credentialsVisible, downloadLetters, fetchOrgs, fetchStatus } from '../api';
import { API_BASE } from '../../live-room/config';

type Call = { url: string; init: RequestInit };

function mockFetch(respond: (c: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const c = { url, init };
    calls.push(c);
    return respond(c);
  });
  return calls;
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('credentials API client', () => {
  it('posts { action, payload } with the bearer token to /api/credentials/<route>', async () => {
    const calls = mockFetch(() => json(200, { ok: true, data: [{ accountId: 'a1' }] }));
    const r = await credCall<{ accountId: string }[]>('org', 'types_list', { accountId: 'a1' }, 'tok-1');
    expect(r).toEqual([{ accountId: 'a1' }]);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${API_BASE}/api/credentials/org`);
    expect(calls[0].init.method).toBe('POST');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok-1');
    expect(headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(String(calls[0].init.body));
    expect(body).toEqual({ action: 'types_list', payload: { accountId: 'a1', client: 'studio' } });

    await fetchOrgs('tok-2');
    expect(JSON.parse(String(calls[1].init.body)).action).toBe('orgs_list');
  });

  it('maps 401 to code session, 403 APP_ONLY to the app-only message, a network error to code network', async () => {
    mockFetch(() => json(401, { ok: false, code: 'UNAUTHORIZED', message: 'Sitzung ungültig.' }));
    const e401 = await credCall('org', 'orgs_list', {}, 't').catch((e) => e);
    expect(e401).toBeInstanceOf(CredentialsApiError);
    expect(e401.status).toBe(401);
    expect(e401.code).toBe('session');

    mockFetch(() => json(403, { ok: false, code: 'APP_ONLY', message: 'irgendwas' }));
    const e403 = await credCall('me', 'mine', {}, 't').catch((e) => e);
    expect(e403.code).toBe('APP_ONLY');
    expect(e403.message).toBe('Das geht nur in der Röbel App.');

    mockFetch(() => json(409, { ok: false, code: 'ORG_NOT_ON_CHAIN', message: 'Diese Organisation ist noch nicht im öffentlichen Register eingetragen.' }));
    const e409 = await credCall('org', 'type_prepare', {}, 't').catch((e) => e);
    expect(e409.code).toBe('ORG_NOT_ON_CHAIN');
    expect(e409.message).toBe('Diese Organisation ist noch nicht im öffentlichen Register eingetragen.');

    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    const eNet = await credCall('org', 'orgs_list', {}, 't').catch((e) => e);
    expect(eNet.code).toBe('network');
    expect(eNet.message).toBe('Server nicht erreichbar. Internetverbindung prüfen.');
  });

  it('reads the public status and treats a failure as switched off', async () => {
    const calls = mockFetch(() => json(200, { enabled: true, configured: true }));
    expect(await fetchStatus()).toEqual({ enabled: true, configured: true });
    expect(calls[0].url).toBe(`${API_BASE}/api/credentials/status`);
    mockFetch(() => json(404, {}));
    expect(await fetchStatus()).toEqual({ enabled: false, configured: false });
  });

  it('downloads letters as a PDF blob', async () => {
    const calls = mockFetch(() => new Response(new Uint8Array([37, 80, 68, 70]), { status: 200, headers: { 'Content-Type': 'application/pdf' } }));
    const blob = await downloadLetters('t', 'acc', 'b1');
    expect(blob.size).toBe(4);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ action: 'letters', payload: { accountId: 'acc', batchId: 'b1', client: 'studio' } });
  });

  it('shows the section only when the register is on and the user manages an org', () => {
    expect(credentialsVisible({ enabled: true, configured: true }, [{ accountId: 'a' } as never])).toBe(true);
    expect(credentialsVisible({ enabled: false, configured: true }, [{ accountId: 'a' } as never])).toBe(false);
    expect(credentialsVisible({ enabled: true, configured: true }, [])).toBe(false);
    expect(credentialsVisible(null, null)).toBe(false);
  });
});
