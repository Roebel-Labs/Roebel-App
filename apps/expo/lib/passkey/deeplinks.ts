/**
 * Deep links of the guardian + recovery flows. Every param is validated before use; the `name`
 * param is attacker-controllable and is ONLY ever displayed (never used to decide anything).
 *
 *   roebel://passkey/guardian?safe=<address>[&name=<display name>]
 *     "Mein Konto-Code": a family member's passkey Safe, to be added as a guardian.
 *   roebel://passkey/recover?wallet=<Safe being recovered>&signer=<new per-key owner>&name=<display>[&legacy=<address>]
 *     shown by the new phone; a guardian opens it to confirm the recovery on-chain.
 *     `legacy` = the citizen's legacy thirdweb account (sponsor hint `recoveryLegacy` only; the
 *     sponsor re-checks `legacy.isAdmin(wallet)` on chain, so a wrong value just gets refused).
 */
import { getAddress, isAddress, isAddressEqual, zeroAddress, type Address } from 'viem';

export const DEEP_LINK_SCHEME = 'roebel';
const ACCEPTED_SCHEMES = ['roebel:', 'ortis:'];
export const MAX_NAME_LENGTH = 60;

export type GuardianLink = { safe: Address; name: string | null };
export type RecoverLink = { wallet: Address; signer: Address; name: string | null; legacy: Address | null };

type Params = Record<string, string | string[] | undefined>;

/** A checksummed address, or null for anything malformed / the zero address. */
export function parseAddressParam(v: unknown): Address | null {
  const s = Array.isArray(v) ? v[0] : v;
  if (typeof s !== 'string') return null;
  const t = s.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(t) || !isAddress(t, { strict: false })) return null;
  const a = getAddress(t.toLowerCase());
  return isAddressEqual(a, zeroAddress) ? null : a;
}

/** Display-only name: trimmed, control / bidi characters removed, length-capped; null when empty. */
export function sanitizeDisplayName(v: unknown): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  if (typeof s !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const cleaned = s.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  return cleaned.length > MAX_NAME_LENGTH ? cleaned.slice(0, MAX_NAME_LENGTH).trim() : cleaned;
}

function query(params: Record<string, string | null | undefined>): string {
  return Object.entries(params)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`)
    .join('&');
}

export function buildGuardianLink(safe: Address, name?: string | null): string {
  return `${DEEP_LINK_SCHEME}://passkey/guardian?${query({ safe: getAddress(safe), name: sanitizeDisplayName(name) })}`;
}

export function buildRecoverLink(p: { wallet: Address; signer: Address; name?: string | null; legacy?: Address | null }): string {
  return `${DEEP_LINK_SCHEME}://passkey/recover?${query({
    wallet: getAddress(p.wallet),
    signer: getAddress(p.signer),
    name: sanitizeDisplayName(p.name),
    legacy: p.legacy ? getAddress(p.legacy) : null,
  })}`;
}

export function parseGuardianParams(params: Params): GuardianLink | null {
  const safe = parseAddressParam(params.safe);
  if (!safe) return null;
  return { safe, name: sanitizeDisplayName(params.name) };
}

export function parseRecoverParams(params: Params): RecoverLink | null {
  const wallet = parseAddressParam(params.wallet);
  const signer = parseAddressParam(params.signer);
  if (!wallet || !signer || isAddressEqual(wallet, signer)) return null;
  const rawLegacy = Array.isArray(params.legacy) ? params.legacy[0] : params.legacy;
  const legacy = rawLegacy ? parseAddressParam(rawLegacy) : null;
  if (rawLegacy && !legacy) return null;
  return { wallet, signer, name: sanitizeDisplayName(params.name), legacy };
}

/** Splits `roebel://passkey/<route>?a=b` into route + params (null for foreign URLs). */
export function parsePasskeyUrl(url: string): { route: 'guardian' | 'recover'; params: Record<string, string> } | null {
  const m = /^([a-z]+:)\/\/passkey\/(guardian|recover)\/?(?:\?(.*))?$/i.exec(url.trim());
  if (!m || !ACCEPTED_SCHEMES.includes(m[1].toLowerCase())) return null;
  const params: Record<string, string> = {};
  for (const part of (m[3] ?? '').split('&')) {
    if (!part) continue;
    const i = part.indexOf('=');
    const k = i < 0 ? part : part.slice(0, i);
    const raw = i < 0 ? '' : part.slice(i + 1);
    let v: string;
    try {
      v = decodeURIComponent(raw.replace(/\+/g, ' '));
    } catch {
      return null;
    }
    if (!(k in params)) params[k] = v;
  }
  return { route: m[2].toLowerCase() as 'guardian' | 'recover', params };
}

/** A scanned "Mein Konto-Code" QR → the guardian link, or null for anything else. */
export function parseKontoCode(data: string): GuardianLink | null {
  const u = parsePasskeyUrl(data);
  if (!u || u.route !== 'guardian') return null;
  return parseGuardianParams(u.params);
}
