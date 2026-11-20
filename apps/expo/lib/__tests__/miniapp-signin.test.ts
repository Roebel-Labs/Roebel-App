/**
 * auth.signIn for mini apps: an EIP-4361 message on Gnosis, signed by the account, wrapped as an
 * "nzsi1." token the app's server verifies (@netizen-labs/miniapp-verify).
 */
import { buildSignInMessage, encodeSignInToken, normalizeSignInNonce, signInOrigin } from '../miniapp-signin';

const A = '0xC49dE63CcfeE46C6C5c3E393293f66779799Fb28';

function decodeB64url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b64, 'base64').toString('utf8');
}

it('builds an EIP-4361 message for Gnosis', () => {
  const m = buildSignInMessage({ domain: 'app.example', uri: 'https://app.example/', address: A, nonce: 'abcdef12', issuedAt: '2026-11-17T10:00:00.000Z', appName: 'Demo' });
  expect(m.startsWith(`app.example wants you to sign in with your Ethereum account:\n${A}\n\nBei Demo anmelden\n\n`)).toBe(true);
  expect(m).toContain('Chain ID: 100');
  expect(m).toContain('Nonce: abcdef12');
  expect(m).toContain('URI: https://app.example/');
  expect(m).toContain('Version: 1');
  expect(m).toContain('Issued At: 2026-11-17T10:00:00.000Z');
});

it('the token round-trips', () => {
  const message = buildSignInMessage({ domain: 'app.example', uri: 'https://app.example/', address: A, nonce: 'abcdef12', issuedAt: '2026-11-17T10:00:00.000Z', appName: 'Bürger-Café' });
  const token = encodeSignInToken({ address: A, message, signature: '0x' + 'ab'.repeat(65) });
  expect(token.startsWith('nzsi1.')).toBe(true);
  const body = token.slice('nzsi1.'.length);
  expect(body).toMatch(/^[A-Za-z0-9_-]+$/);
  expect(JSON.parse(decodeB64url(body))).toEqual({ address: A, message, signature: '0x' + 'ab'.repeat(65) });
});

it('keeps a well-formed nonce and replaces anything else', () => {
  expect(normalizeSignInNonce('abcDEF1234', () => new Uint8Array(16))).toBe('abcDEF1234');
  const fresh = normalizeSignInNonce('bad nonce!', () => new Uint8Array(16).fill(255));
  expect(fresh).toBe('ff'.repeat(16));
  expect(normalizeSignInNonce(undefined, () => new Uint8Array(16).fill(1))).toBe('01'.repeat(16));
});

it('takes domain and uri from the home url', () => {
  expect(signInOrigin('https://demo.roebel.site/start?x=1')).toEqual({ domain: 'demo.roebel.site', uri: 'https://demo.roebel.site/' });
  expect(signInOrigin('not a url')).toBeNull();
});
