/**
 * auth.signIn for mini apps: the account signs an EIP-4361 ("Sign-In with Ethereum") message for
 * the app's own domain on Gnosis (chain id 100). The result is handed to the app as one opaque
 * token, `"nzsi1." + base64url(JSON { address, message, signature })`, which the app's server
 * verifies with @netizen-labs/miniapp-verify (plain contract signature, ERC-6492 wrapper or the
 * Safe-admin envelope of a migrated account — the host passes on whatever the account returns).
 */

export const SIGN_IN_CHAIN_ID = 100;
const NONCE_RE = /^[A-Za-z0-9]{8,64}$/;

export function buildSignInMessage(p: {
  domain: string;
  uri: string;
  address: string;
  nonce: string;
  issuedAt: string;
  appName: string;
}): string {
  return [
    `${p.domain} wants you to sign in with your Ethereum account:`,
    p.address,
    '',
    `Bei ${p.appName} anmelden`,
    '',
    `URI: ${p.uri}`,
    'Version: 1',
    `Chain ID: ${SIGN_IN_CHAIN_ID}`,
    `Nonce: ${p.nonce}`,
    `Issued At: ${p.issuedAt}`,
  ].join('\n');
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function utf8(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }
  return out;
}

/** base64url without padding; no Buffer/btoa dependency (Hermes). */
function base64url(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += B64[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += B64[n & 63];
  }
  return out;
}

export function encodeSignInToken(p: { address: string; message: string; signature: string }): string {
  return 'nzsi1.' + base64url(utf8(JSON.stringify({ address: p.address, message: p.message, signature: p.signature })));
}

/** The app's nonce when it is 8-64 alphanumerics, else 16 fresh random bytes as hex. */
export function normalizeSignInNonce(nonce: unknown, randomBytes: (n: number) => Uint8Array): string {
  if (typeof nonce === 'string' && NONCE_RE.test(nonce)) return nonce;
  return Array.from(randomBytes(16), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** EIP-4361 domain (host) and URI (origin + "/") from the app's home URL; null when unparsable. */
export function signInOrigin(homeUrl: string): { domain: string; uri: string } | null {
  try {
    const u = new URL(homeUrl);
    if (!/^https?:$/.test(u.protocol) || !u.host) return null;
    return { domain: u.host, uri: `${u.origin}/` };
  } catch {
    return null;
  }
}
