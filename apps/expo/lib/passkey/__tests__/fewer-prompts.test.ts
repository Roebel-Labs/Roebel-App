/**
 * Fewer fingerprint prompts on a passkey session:
 *  - the API session token: ONE signature per device session (lazy, cached, refreshed, revocable),
 *    and a server without tokens never costs an extra prompt;
 *  - signed requests use the token and fall back to the per-request signature;
 *  - the key backup reads with a cached token and writes with the token (replace keeps a proof);
 *  - the PRF is evaluated at most once per slot (sequential AND concurrent), and never once the
 *    key is persisted locally.
 */
import vector from './session-message-vector.json';
import {
  PASSKEY_API_SESSION_KEY,
  PASSKEY_API_SESSION_REFRESH_SEC,
  PASSKEY_API_SESSION_TTL_SEC,
  buildPasskeySessionMessage,
  createApiSessionManager,
  runWithApiSession,
  type ApiSessionDeps,
} from '../api-session';
import { createKeyBackupClient } from '../key-backup';
import { resolvePasskeySecret, singleFlight, SLOT_DEVICE_BLOB, type ResolveDeps } from '../derived-keys';

const ID = '0xc49de63ccfee46c6c5c3e393293f66779799fb28';
const NOW = 1_790_000_000;

function memStorage() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: async (k: string) => m.get(k) ?? null,
    setItem: async (k: string, v: string) => void m.set(k, v),
    deleteItem: async (k: string) => void m.delete(k),
  };
}

type Call = { url: string; method: string; headers: Record<string, string>; body: any };

function fakeServer(opts: { enabled?: boolean; startStatus?: number } = {}) {
  const calls: Call[] = [];
  let n = 0;
  const fetch = jest.fn(async (url: string, init: any) => {
    const call = { url, method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined };
    calls.push(call);
    if (url.endsWith('/api/passkey/session') && init.method === 'GET') {
      return { ok: true, status: 200, json: async () => ({ enabled: opts.enabled ?? true }) };
    }
    if (url.endsWith('/api/passkey/session/start')) {
      const status = opts.startStatus ?? 200;
      if (status !== 200) return { ok: false, status, json: async () => ({ error: 'store_unavailable' }) };
      n += 1;
      return { ok: true, status: 200, json: async () => ({ token: `pst1.tok${n}.mac`, jti: call.body.nonce, expiresAt: call.body.expiresAt }) };
    }
    if (url.endsWith('/api/passkey/session/revoke')) return { ok: true, status: 200, json: async () => ({ ok: true }) };
    throw new Error(`unexpected ${url}`);
  });
  return { fetch, calls };
}

let counter = 0;
function manager(over: Partial<ApiSessionDeps> = {}, server = fakeServer(), storage = memStorage(), clock = { now: NOW }) {
  const m = createApiSessionManager({
    apiUrl: 'https://api.test',
    storage,
    randomHex: (n) => (++counter).toString(16).padStart(n * 2, '0'),
    fetch: server.fetch as any,
    nowSec: () => clock.now,
    ...over,
  });
  return { m, server, storage, clock };
}

const signer = () => ({ address: '0xC49dE63CcfeE46C6C5c3E393293f66779799Fb28', signMessage: jest.fn(async () => '0x' + 'ab'.repeat(65)) });

describe('API session token (one signature per device session)', () => {
  it('start message is byte-exact with the server (session-message-vector.json)', () => {
    expect(
      buildPasskeySessionMessage({
        identity: vector.identity,
        deviceId: vector.deviceId,
        nonce: vector.nonce,
        issuedAt: vector.issuedAt,
        expiresAt: vector.expiresAt,
      }),
    ).toBe(vector.message);
  });

  it('first get signs ONCE; later gets (and concurrent ones) reuse the token; peek never signs', async () => {
    const { m, server, storage } = manager();
    const acc = signer();
    expect(await m.peek(ID)).toBeNull();
    const [a, b] = await Promise.all([m.get(acc), m.get(acc)]);
    expect(acc.signMessage).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    for (let i = 0; i < 5; i++) await m.get(acc);
    expect(acc.signMessage).toHaveBeenCalledTimes(1);
    expect(await m.peek(ID)).toEqual(a);
    // what was signed is exactly the server's text, for the identity, bound to the device id
    const start = server.calls.find((c) => c.url.endsWith('/start'))!;
    expect((acc.signMessage.mock.calls[0] as any)[0].message).toBe(buildPasskeySessionMessage(start.body));
    expect(start.body.identity).toBe(ID);
    expect(start.body.expiresAt - start.body.issuedAt).toBe(PASSKEY_API_SESSION_TTL_SEC);
    expect(JSON.parse(storage.m.get(PASSKEY_API_SESSION_KEY)!)).toMatchObject({ identity: ID, deviceId: start.body.deviceId, token: a!.token });
  });

  it('a server without tokens costs NO signature (probe before signing)', async () => {
    const { m } = manager({}, fakeServer({ enabled: false }));
    const acc = signer();
    expect(await m.get(acc)).toBeNull();
    expect(await m.get(acc)).toBeNull();
    expect(acc.signMessage).not.toHaveBeenCalled();
    const off = manager({ apiUrl: '' });
    expect(await off.m.get(acc)).toBeNull();
    expect(acc.signMessage).not.toHaveBeenCalled();
  });

  it('refreshes (one new signature) when < 3 days are left, keeping the device id', async () => {
    const { m, clock, server } = manager();
    const acc = signer();
    const first = await m.get(acc);
    clock.now += PASSKEY_API_SESSION_TTL_SEC - PASSKEY_API_SESSION_REFRESH_SEC + 10;
    const second = await m.get(acc);
    expect(acc.signMessage).toHaveBeenCalledTimes(2);
    expect(second!.token).not.toBe(first!.token);
    expect(second!.deviceId).toBe(first!.deviceId);
    expect(server.calls.filter((c) => c.url.endsWith('/start'))).toHaveLength(2);
  });

  it('a failed start does not re-prompt on every request (5 min cooldown)', async () => {
    const { m, clock } = manager({}, fakeServer({ startStatus: 503 }));
    const acc = signer();
    expect(await m.get(acc)).toBeNull();
    expect(await m.get(acc)).toBeNull();
    expect(acc.signMessage).toHaveBeenCalledTimes(1);
    clock.now += 301;
    await m.get(acc);
    expect(acc.signMessage).toHaveBeenCalledTimes(2);
  });

  it('a cancelled prompt throws to the caller (no silent retry loop)', async () => {
    const { m } = manager();
    const acc = { ...signer(), signMessage: jest.fn(async () => { throw new Error('Passkey-Vorgang abgebrochen'); }) };
    await expect(m.get(acc)).rejects.toThrow('abgebrochen');
    expect(acc.signMessage).toHaveBeenCalledTimes(1);
  });

  it('another identity on the same device gets its own token; invalidate/revoke forget it (device id stays)', async () => {
    const { m, server, storage } = manager();
    const acc = signer();
    const t = (await m.get(acc))!;
    const other = { ...signer(), address: '0x0000000000000000000000000000000000000abc' };
    const t2 = (await m.get(other))!;
    expect(other.signMessage).toHaveBeenCalledTimes(1);
    expect(t2.deviceId).toBe(t.deviceId);
    await m.invalidate(t2.token);
    expect(await m.peek(other.address)).toBeNull();
    await m.get(other);
    await m.revoke();
    const revoke = server.calls.find((c) => c.url.endsWith('/revoke'))!;
    expect(revoke.headers['x-roebel-device']).toBe(t.deviceId);
    expect(revoke.headers.Authorization).toMatch(/^Bearer pst1\./);
    expect(JSON.parse(storage.m.get(PASSKEY_API_SESSION_KEY)!)).toEqual({ deviceId: t.deviceId });
  });
});

describe('runWithApiSession (signed requests)', () => {
  const tok = { token: 'pst1.a.b', deviceId: 'dev_0123456789abcdef' };
  const mgr = (t: typeof tok | null = tok) => ({ get: jest.fn(async () => t), invalidate: jest.fn(async () => undefined) });

  it('uses the token (web: Authorization Bearer, edge: x-roebel-session) and never signs', async () => {
    for (const kind of ['web', 'edge'] as const) {
      const withSignature = jest.fn(async () => 'signed');
      const withToken = jest.fn(async () => ({ status: 200, value: 'token' }));
      const r = await runWithApiSession({ manager: mgr(), account: signer(), kind, endpoint: kind, unsupported: new Set(), withToken, withSignature });
      expect(r).toBe('token');
      expect(withSignature).not.toHaveBeenCalled();
      const headers = (withToken.mock.calls[0] as any)[0];
      if (kind === 'web') expect(headers).toEqual({ Authorization: 'Bearer pst1.a.b', 'x-roebel-device': tok.deviceId });
      else expect(headers).toEqual({ 'x-roebel-session': 'pst1.a.b', 'x-roebel-device': tok.deviceId });
    }
  });

  it('a refused token (401 SESSION_INVALID) is forgotten and the request signs instead', async () => {
    const m = mgr();
    const r = await runWithApiSession({
      manager: m, account: signer(), kind: 'edge', endpoint: 'e', unsupported: new Set(),
      withToken: async () => ({ status: 401, code: 'SESSION_INVALID', value: 'x' }),
      withSignature: async () => 'signed',
    });
    expect(r).toBe('signed');
    expect(m.invalidate).toHaveBeenCalledWith(tok.token);
  });

  it('a server that ignores tokens is remembered for this run (no token round-trip again)', async () => {
    const unsupported = new Set<string>();
    const withToken = jest.fn(async () => ({ status: 400, code: 'BAD_REQUEST', value: 'x' }));
    const p = { manager: mgr(), account: signer(), kind: 'edge' as const, endpoint: 'edge:org', unsupported, withToken, withSignature: async () => 'signed' };
    expect(await runWithApiSession(p)).toBe('signed');
    expect(await runWithApiSession(p)).toBe('signed');
    expect(withToken).toHaveBeenCalledTimes(1);
  });

  it('no token → the per-request signature, exactly as before', async () => {
    const withToken = jest.fn();
    const r = await runWithApiSession({ manager: mgr(null), account: signer(), kind: 'web', endpoint: 'w', unsupported: new Set(), withToken, withSignature: async () => 'signed' });
    expect(r).toBe('signed');
    expect(withToken).not.toHaveBeenCalled();
  });

  it('an application error with the token is returned as is (no second, signed attempt)', async () => {
    const withSignature = jest.fn(async () => 'signed');
    const r = await runWithApiSession({
      manager: mgr(), account: signer(), kind: 'edge', endpoint: 'e', unsupported: new Set(),
      withToken: async () => ({ status: 403, code: 'FORBIDDEN', value: 'forbidden' }),
      withSignature,
    });
    expect(r).toBe('forbidden');
    expect(withSignature).not.toHaveBeenCalled();
  });
});

describe('key backup with the session token', () => {
  const tok = { token: 'pst1.a.b', deviceId: 'dev_0123456789abcdef' };
  function client(session: { peek: jest.Mock; get: jest.Mock; invalidate: jest.Mock }, respond: (path: string, init: any) => { status: number; json: any }) {
    const sign = jest.fn(async () => ({ signature: ('0x' + '11'.repeat(65)) as `0x${string}`, prf: ('0x' + '22'.repeat(32)) as `0x${string}` }));
    const fetch = jest.fn(async (url: string, init: any) => {
      const r = respond(url, init);
      return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.json };
    });
    const c = createKeyBackupClient({ apiUrl: 'https://api.test', identity: ID as `0x${string}`, sign, fetch, nowSec: () => NOW, session });
    return { c, sign, fetch };
  }

  it('read: a cached token reads without a prompt; no cached token → the signed read (which also yields the PRF)', async () => {
    const s = { peek: jest.fn(async () => tok), get: jest.fn(), invalidate: jest.fn() };
    const { c, sign, fetch } = client(s, () => ({ status: 200, json: { blobs: { maci: 'pkv1:x' } } }));
    expect(await c.read()).toEqual({ status: 'found', blobs: { maci: 'pkv1:x' } });
    expect(sign).not.toHaveBeenCalled();
    expect((fetch.mock.calls[0] as any)[1].headers.Authorization).toBe('Bearer pst1.a.b');
    expect(s.get).not.toHaveBeenCalled();

    const s2 = { peek: jest.fn(async () => null), get: jest.fn(), invalidate: jest.fn() };
    const k2 = client(s2, () => ({ status: 200, json: { blobs: {} } }));
    expect(await k2.c.read()).toEqual({ status: 'none', prf: '0x' + '22'.repeat(32) });
    expect(k2.sign).toHaveBeenCalledTimes(1);
    expect(s2.get).not.toHaveBeenCalled();
  });

  it('write: the token replaces the write proof; replace:true always signs', async () => {
    const s = { peek: jest.fn(), get: jest.fn(async () => tok), invalidate: jest.fn() };
    const { c, sign, fetch } = client(s, () => ({ status: 200, json: { ok: true } }));
    expect(await c.write({ maci: 'pkv1:x' })).toBe('stored');
    expect(sign).not.toHaveBeenCalled();
    expect(JSON.parse((fetch.mock.calls[0] as any)[1].body)).toEqual({ identity: ID, blobs: { maci: 'pkv1:x' } });
    expect(await c.write({ maci: 'pkv1:x' }, true)).toBe('stored');
    expect(sign).toHaveBeenCalledTimes(1);
    expect(s.get).toHaveBeenCalledTimes(1);
  });

  it('a refused token falls back to the signed request and forgets the token', async () => {
    const s = { peek: jest.fn(), get: jest.fn(async () => tok), invalidate: jest.fn(async () => undefined) };
    const { c, sign } = client(s, (_u, init) =>
      JSON.parse(init.body).proof ? { status: 200, json: { ok: true } } : { status: 401, json: { error: 'session_invalid' } },
    );
    expect(await c.write({ nostr: 'pkv1:y' })).toBe('stored');
    expect(sign).toHaveBeenCalledTimes(1);
    expect(s.invalidate).toHaveBeenCalledWith(tok.token);
  });
});

describe('PRF at most once per slot', () => {
  const PRF = ('0x' + '33'.repeat(32)) as `0x${string}`;
  function deps(local: { v: Uint8Array | null }, getPrf: jest.Mock, over: Partial<ResolveDeps> = {}): ResolveDeps {
    const dev = new Map<string, string>([[SLOT_DEVICE_BLOB.maci, 'pkv1:blob']]);
    return {
      slot: 'maci',
      loadLocal: async () => local.v,
      saveLocal: async (s) => void (local.v = s),
      storage: { getItem: async (k) => dev.get(k) ?? null, setItem: async (k, v) => void dev.set(k, v) },
      getPrf,
      hasLegacyHistory: async () => true,
      generate: () => new Uint8Array([9]),
      wrap: async () => 'pkv1:w',
      unwrap: async () => new Uint8Array([1, 2, 3]),
      ...over,
    };
  }

  it('the first use unwraps with ONE PRF and persists; every later use needs none', async () => {
    const local = { v: null as Uint8Array | null };
    const getPrf = jest.fn(async () => PRF);
    const first = await resolvePasskeySecret(deps(local, getPrf));
    expect(first.source).toBe('deviceBlob');
    expect(getPrf).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 3; i++) expect((await resolvePasskeySecret(deps(local, getPrf))).source).toBe('local');
    expect(getPrf).toHaveBeenCalledTimes(1);
  });

  it('concurrent resolutions of the same slot share ONE PRF prompt (singleFlight)', async () => {
    const local = { v: null as Uint8Array | null };
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const getPrf = jest.fn(async () => {
      await gate;
      return PRF;
    });
    const inFlight = new Map<string, Promise<unknown>>();
    const run = () => singleFlight(inFlight as Map<string, Promise<any>>, `${ID}:maci`, () => resolvePasskeySecret(deps(local, getPrf)));
    const all = Promise.all([run(), run(), run()]);
    release();
    const results = await all;
    expect(getPrf).toHaveBeenCalledTimes(1);
    expect(new Set(results)).toEqual(new Set([results[0]]));
    expect(inFlight.size).toBe(0);
  });

  it('a key already on the device never evaluates the PRF (no prompt, no backup read)', async () => {
    const getPrf = jest.fn(async () => PRF);
    const read = jest.fn();
    const r = await resolvePasskeySecret(deps({ v: new Uint8Array([7]) }, getPrf, { remote: { read, write: jest.fn() } }));
    expect(r.source).toBe('local');
    expect(getPrf).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });
});
