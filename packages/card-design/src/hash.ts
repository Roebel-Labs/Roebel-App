import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import type { CardDesign } from './schema';

/** JSON with object keys sorted recursively and no whitespace; `undefined` members are omitted. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== 'object') {
    if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('canonicalJson: non-finite number');
    return JSON.stringify(v);
  }
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : canonicalJson(x))).join(',')}]`;
  const entries = Object.keys(v as Record<string, unknown>)
    .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`);
  return `{${entries.join(',')}}`;
}

/** sha256 hex of the canonical JSON of a (validated) design. */
export function designHash(d: CardDesign): string {
  return bytesToHex(sha256(utf8ToBytes(canonicalJson(d))));
}
