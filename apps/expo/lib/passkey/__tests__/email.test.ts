jest.mock('react-native-passkey', () => ({ Passkey: { create: jest.fn(), get: jest.fn(), isSupported: () => true } }));

import { createPrivateKey, createPublicKey, sign as nodeSign, verify as nodeVerify } from 'crypto';
import { concatHex, decodeAbiParameters, getAddress, hashMessage, hexToBigInt, hexToBytes, numberToHex, sliceHex, type Hex } from 'viem';
import {
  EMAIL_STATE_KEY,
  PasskeyEmailError,
  buildEmailProofMessage,
  confirmEmailCode,
  emailErrorMessage,
  emailProofChallenge,
  loadEmailState,
  normalizeEmail,
  removeWarningEmail,
  requestEmailCode,
  saveEmailState,
  signEmailProof,
} from '../email';
import { SAFE_WEBAUTHN_SHARED_SIGNER } from '../constants';
import { webAuthnSigningDigest } from '../userop';
import { PasskeyCancelledError, type PasskeyAssertion } from '../webauthn';
import vector from './email-proof-vector.json';
import rv from './recovery-vector.json';

const g = rv.guardianApproval;
const SAFE = getAddress(g.guardianSafe);
const b64u = (h: Hex) => Buffer.from(hexToBytes(h)).toString('base64url');

/** A real WebAuthn assertion by the vector's TEST-ONLY guardian passkey (P-256 key 0xa1). */
async function realSign(_id: string, challenge: Hex): Promise<PasskeyAssertion> {
  const clientDataJSON = `{"type":"webauthn.get","challenge":"${b64u(challenge)}","origin":"https://id.ortis.app"}`;
  const { message } = webAuthnSigningDigest(g.authenticatorData as Hex, clientDataJSON);
  const key = createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', x: b64u(g.guardianX as Hex), y: b64u(g.guardianY as Hex), d: b64u(numberToHex(hexToBigInt(g.guardianPasskeyPrivateKey as Hex), { size: 32 })) },
    format: 'jwk',
  });
  const raw = nodeSign('sha256', Buffer.from(hexToBytes(message)), { key, dsaEncoding: 'ieee-p1363' });
  return {
    authenticatorData: g.authenticatorData as Hex,
    clientDataJSON,
    r: BigInt(`0x${raw.subarray(0, 32).toString('hex')}`),
    s: BigInt(`0x${raw.subarray(32).toString('hex')}`),
  };
}

function fakeFetch(replies: { status: number; body: unknown }[]) {
  const calls: { url: string; body: any; signal?: AbortSignal }[] = [];
  const f = jest.fn(async (url: string, init: { body: string; signal?: AbortSignal }) => {
    calls.push({ url, body: JSON.parse(init.body), signal: init.signal });
    const r = replies.shift() ?? { status: 500, body: {} };
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
  });
  return { f, calls };
}

describe('email proof text (byte-exact with apps/web email-proof.ts)', () => {
  it('matches the shared vector', () => {
    const safe = vector.safe as Hex;
    expect(buildEmailProofMessage({ action: 'add', safe, email: vector.email, timestamp: vector.timestamp })).toBe(vector.addMessage);
    expect(buildEmailProofMessage({ action: 'remove', safe, timestamp: vector.timestamp })).toBe(vector.removeMessage);
    expect(hashMessage(vector.addMessage)).toBe(vector.addMessageHash);
    expect(emailProofChallenge(getAddress(vector.safe), vector.addMessage)).toBe(vector.addChallenge);
  });

  it('normalizeEmail matches the server rule', () => {
    expect(normalizeEmail('  Max.Muster@Example.DE ')).toBe('max.muster@example.de');
    for (const bad of ['', 'a@b', 'a b@c.de', '@c.de', 'a@.de', 42, null]) expect(normalizeEmail(bad)).toBeNull();
  });
});

describe('signEmailProof', () => {
  it('produces a one-owner Safe signature whose P-256 part verifies over the SafeMessage challenge', async () => {
    const msg = buildEmailProofMessage({ action: 'add', safe: SAFE, email: 'max@example.de', timestamp: 1_790_000_000 });
    const sign = jest.fn(realSign);
    const sig = await signEmailProof({ credentialId: 'cred', safe: SAFE }, msg, { sign });
    const challenge = emailProofChallenge(SAFE, msg);
    expect(sign).toHaveBeenCalledWith('cred', challenge);

    // bytes32(owner) ++ bytes32(65) ++ 0x00 ++ uint256(len) ++ abi.encode(authData, fields, r, s)
    expect(getAddress(`0x${sig.slice(2 + 24, 2 + 64)}`)).toBe(SAFE_WEBAUTHN_SHARED_SIGNER);
    expect(hexToBigInt(sliceHex(sig, 32, 64))).toBe(65n);
    const len = Number(hexToBigInt(sliceHex(sig, 65, 97)));
    const [authData, fields, r, s] = decodeAbiParameters(
      [{ type: 'bytes' }, { type: 'string' }, { type: 'uint256' }, { type: 'uint256' }],
      sliceHex(sig, 97, 97 + len),
    );
    const cdj = `{"type":"webauthn.get","challenge":"${b64u(challenge)}",${fields}}`;
    const { message } = webAuthnSigningDigest(authData, cdj);
    const pub = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(g.guardianX as Hex), y: b64u(g.guardianY as Hex) }, format: 'jwk' });
    const rs = Buffer.from(hexToBytes(concatHex([numberToHex(r, { size: 32 }), numberToHex(s, { size: 32 })])));
    expect(nodeVerify('sha256', Buffer.from(hexToBytes(message)), { key: pub, dsaEncoding: 'ieee-p1363' }, rs)).toBe(true);
  });

  it('signs through the per-key owner after a recovery', async () => {
    const owner = getAddress(g.newOwner);
    const sig = await signEmailProof({ credentialId: 'c', safe: SAFE, owner }, 'x', { sign: realSign });
    expect(getAddress(`0x${sig.slice(2 + 24, 2 + 64)}`)).toBe(owner);
  });
});

describe('requestEmailCode / confirmEmailCode / removeWarningEmail', () => {
  const deps = (f: ReturnType<typeof fakeFetch>['f']) => ({ fetch: f, apiUrl: 'https://preview.example/', sign: realSign, nowSec: () => 1_790_000_000 });

  it('start: normalizes, signs the add text, posts {safe, email, proof}', async () => {
    const { f, calls } = fakeFetch([{ status: 200, body: { ok: true, expiresAt: 1_790_000_600 } }]);
    const res = await requestEmailCode({ credentialId: 'c', safe: SAFE }, ' Max@Example.de ', deps(f));
    expect(res).toEqual({ email: 'max@example.de', expiresAt: 1_790_000_600 });
    expect(calls[0].url).toBe('https://preview.example/api/passkey/email/start');
    expect(calls[0].body.safe).toBe(SAFE);
    expect(calls[0].body.email).toBe('max@example.de');
    expect(calls[0].body.proof.timestamp).toBe(1_790_000_000);
    expect(calls[0].body.proof.signature).toMatch(/^0x[0-9a-f]+$/);
    expect(calls[0].signal).toBeDefined();
  });

  it('start: rejects an invalid address before any passkey prompt', async () => {
    const sign = jest.fn(realSign);
    const { f } = fakeFetch([]);
    await expect(requestEmailCode({ credentialId: 'c', safe: SAFE }, 'nope', { ...deps(f), sign })).rejects.toMatchObject({ code: 'invalid_email' });
    expect(sign).not.toHaveBeenCalled();
    expect(f).not.toHaveBeenCalled();
  });

  it('maps server errors to German messages', async () => {
    const { f } = fakeFetch([{ status: 429, body: { error: 'rate_limited' } }]);
    const p = requestEmailCode({ credentialId: 'c', safe: SAFE }, 'a@example.de', deps(f));
    await expect(p).rejects.toBeInstanceOf(PasskeyEmailError);
    await expect(p).rejects.toMatchObject({ code: 'rate_limited', message: emailErrorMessage('rate_limited') });
    expect(emailErrorMessage('safe_not_deployed')).toMatch(/Passkey-Einrichtung/);
    expect(emailErrorMessage('whatever')).toMatch(/schiefgelaufen/);
  });

  it('a cancelled passkey prompt becomes code "cancelled", no request', async () => {
    const { f } = fakeFetch([]);
    const sign = jest.fn(async () => {
      throw new PasskeyCancelledError();
    });
    await expect(requestEmailCode({ credentialId: 'c', safe: SAFE }, 'a@example.de', { ...deps(f), sign })).rejects.toMatchObject({ code: 'cancelled' });
    expect(f).not.toHaveBeenCalled();
  });

  it('network failure / abort becomes code "network"', async () => {
    const f = jest.fn(async () => {
      throw new Error('aborted');
    });
    await expect(confirmEmailCode(SAFE, '123456', { fetch: f, apiUrl: 'https://x' })).rejects.toMatchObject({ code: 'network' });
  });

  it('times out with an AbortController deadline', async () => {
    const f = jest.fn(
      (_u: string, init: { signal?: AbortSignal }) =>
        new Promise<never>((_, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted')))),
    );
    await expect(confirmEmailCode(SAFE, '123456', { fetch: f as any, apiUrl: 'https://x', timeoutMs: 10 })).rejects.toMatchObject({ code: 'network' });
  });

  it('no API URL = disabled', async () => {
    await expect(confirmEmailCode(SAFE, '123456', { apiUrl: '' })).rejects.toMatchObject({ code: 'disabled' });
  });

  it('verify: strips spaces, requires 6 digits, posts {safe, code}', async () => {
    const { f, calls } = fakeFetch([{ status: 200, body: { ok: true, verified: true } }]);
    await confirmEmailCode(SAFE, '123 456', deps(f));
    expect(calls[0].url).toBe('https://preview.example/api/passkey/email/verify');
    expect(calls[0].body).toEqual({ safe: SAFE, code: '123456' });
    await expect(confirmEmailCode(SAFE, '12345', deps(f))).rejects.toMatchObject({ code: 'invalid_code' });
  });

  it('remove: signs the remove text and posts {safe, proof}', async () => {
    const sign = jest.fn(realSign);
    const { f, calls } = fakeFetch([{ status: 200, body: { ok: true } }]);
    await removeWarningEmail({ credentialId: 'c', safe: SAFE }, { ...deps(f), sign });
    const removeMsg = buildEmailProofMessage({ action: 'remove', safe: SAFE, timestamp: 1_790_000_000 });
    expect(sign).toHaveBeenCalledWith('c', emailProofChallenge(SAFE, removeMsg));
    expect(calls[0].url).toBe('https://preview.example/api/passkey/email/remove');
    expect(Object.keys(calls[0].body).sort()).toEqual(['proof', 'safe']);
  });
});

describe('device-local email state', () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { m, storage: { getItem: async (k: string) => m.get(k) ?? null, setItem: async (k: string, v: string) => void m.set(k, v) } };
  };

  it('round-trips and is scoped to the Safe', async () => {
    const { m, storage } = mem();
    expect(await loadEmailState(storage, SAFE)).toEqual({ safe: SAFE, verified: null, pending: null });
    await saveEmailState(storage, { safe: SAFE, verified: 'a@example.de', pending: { email: 'b@example.de', expiresAt: 5 } });
    expect(await loadEmailState(storage, SAFE)).toEqual({ safe: SAFE, verified: 'a@example.de', pending: { email: 'b@example.de', expiresAt: 5 } });
    const other = getAddress(rv.newSafe);
    expect(await loadEmailState(storage, other)).toEqual({ safe: other, verified: null, pending: null });
    m.set(EMAIL_STATE_KEY, '{not json');
    expect(await loadEmailState(storage, SAFE)).toEqual({ safe: SAFE, verified: null, pending: null });
  });
});
