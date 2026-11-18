/**
 * Credential references — the one syntax used in manifests, tokens, the SDK and every table.
 *
 *  - built-ins: `citizen`, `attester`, `guest`
 *  - one register type: `type:0x<64 hex>` (the register's `typeIdOf(orgId, localId)`)
 *  - any type of an org: `org:<org account id>` (uuid)
 *
 * A held credential is always a built-in or a `type:` reference and carries `org` when it has
 * one, so an `org:` pattern matches without a lookup.
 */

export const BUILTIN_CREDENTIALS = ['citizen', 'attester', 'guest'] as const;

export type BuiltinCredential = (typeof BUILTIN_CREDENTIALS)[number];

export type ParsedCredentialRef =
  | { kind: 'builtin'; name: BuiltinCredential }
  | { kind: 'type'; typeId: string }
  | { kind: 'org'; org: string };

const TYPE_RE = /^type:(0x[0-9a-fA-F]{64})$/;
const ORG_RE = /^org:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;

/** Parse a credential reference; hex and uuid are lowercased. null when `s` is not one. */
export function parseCredentialRef(s: string): ParsedCredentialRef | null {
  if (typeof s !== 'string') return null;
  if ((BUILTIN_CREDENTIALS as readonly string[]).includes(s)) {
    return { kind: 'builtin', name: s as BuiltinCredential };
  }
  const t = TYPE_RE.exec(s);
  if (t) return { kind: 'type', typeId: t[1].toLowerCase() };
  const o = ORG_RE.exec(s);
  if (o) return { kind: 'org', org: o[1].toLowerCase() };
  return null;
}

export function isCredentialRef(s: unknown): s is string {
  return typeof s === 'string' && parseCredentialRef(s) !== null;
}

/**
 * Whether a held credential satisfies `pattern`. A built-in or `type:` pattern matches the same
 * `held.type`; an `org:` pattern matches when `held.org` is that org; nothing else matches.
 */
export function credentialMatches(pattern: string, held: { type: string; org?: string }): boolean {
  const p = parseCredentialRef(pattern);
  if (!p) return false;
  if (p.kind === 'org') return typeof held.org === 'string' && held.org.toLowerCase() === p.org;
  const h = parseCredentialRef(held.type);
  if (!h) return false;
  if (p.kind === 'builtin') return h.kind === 'builtin' && h.name === p.name;
  return h.kind === 'type' && h.typeId === p.typeId;
}
