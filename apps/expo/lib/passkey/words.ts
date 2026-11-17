/**
 * Recovery words: BIP-39 (English, 12 words) primitives. Pure; no storage, no network.
 *
 * Standard path m/44'/60'/0'/0/i so any wallet tool can use the words to confirm a recovery.
 * The seed is derived ONCE per call (pbkdf2-sha512, 2048 rounds) and accounts are built from the
 * resulting HD root, because `mnemonicToAccount` repeats the 2048 rounds per index (slow on Hermes).
 */
import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256, sha512 } from '@noble/hashes/sha2';
import type { Address, Hex } from 'viem';
import { HDKey, english, hdKeyToAccount, type HDAccount } from 'viem/accounts';
import { bytesToHex } from 'viem';
import { utf8Encode } from './encoding';
import { randomBytes } from './random';

export const WORD_COUNT = 12;
export const WORDS_POOL_SIZE = 5;
export const WORDS_VAULT_SALT = 'id.ortis.app/words-vault/v1';

const WORD_INDEX: Map<string, number> = new Map(english.map((w, i) => [w, i]));

/** 16 bytes of entropy to a 12-word phrase (128 bits + 4 checksum bits = 12 x 11 bits). */
export function entropyToPhrase(entropy: Uint8Array): string {
  if (entropy.length !== 16) throw new Error('entropy must be 16 bytes');
  const check = sha256(entropy)[0] >> 4;
  let bits = 0n;
  for (const b of entropy) bits = (bits << 8n) | BigInt(b);
  bits = (bits << 4n) | BigInt(check);
  const words: string[] = [];
  for (let i = 0; i < WORD_COUNT; i++) {
    const shift = BigInt((WORD_COUNT - 1 - i) * 11);
    words.push(english[Number((bits >> shift) & 0x7ffn)]);
  }
  return words.join(' ');
}

export function generatePhrase(random: (n: number) => Uint8Array = randomBytes): string {
  return entropyToPhrase(random(16));
}

/** NFKD, lower-case, single spaces, trimmed. */
export function normalizePhrase(input: string): string {
  return input.normalize('NFKD').toLowerCase().split(/\s+/).filter(Boolean).join(' ');
}

export type PhraseCheck =
  | { ok: true; phrase: string }
  | { ok: false; reason: 'count' | 'word' | 'checksum'; badWords: string[] };

export function validatePhrase(input: string): PhraseCheck {
  const phrase = normalizePhrase(input);
  const words = phrase ? phrase.split(' ') : [];
  if (words.length !== WORD_COUNT) return { ok: false, reason: 'count', badWords: [] };
  const badWords = words.filter((w) => !WORD_INDEX.has(w));
  if (badWords.length > 0) return { ok: false, reason: 'word', badWords };
  let bits = 0n;
  for (const w of words) bits = (bits << 11n) | BigInt(WORD_INDEX.get(w)!);
  const check = Number(bits & 0xfn);
  let entropy = bits >> 4n;
  const bytes = new Uint8Array(16);
  for (let i = 15; i >= 0; i--) {
    bytes[i] = Number(entropy & 0xffn);
    entropy >>= 8n;
  }
  if (sha256(bytes)[0] >> 4 !== check) return { ok: false, reason: 'checksum', badWords: [] };
  return { ok: true, phrase };
}

function seedRoot(phrase: string): HDKey {
  const seed = pbkdf2(sha512, utf8Encode(normalizePhrase(phrase)), utf8Encode('mnemonic'), {
    c: 2048,
    dkLen: 64,
  });
  return HDKey.fromMasterSeed(seed);
}

export function wordAccount(phrase: string, index: number): HDAccount {
  return hdKeyToAccount(seedRoot(phrase), { addressIndex: index });
}

export function deriveWordAddresses(phrase: string, count: number = WORDS_POOL_SIZE): Address[] {
  const root = seedRoot(phrase);
  const out: Address[] = [];
  for (let i = 0; i < count; i++) out.push(hdKeyToAccount(root, { addressIndex: i }).address);
  return out;
}

/** HKDF-SHA256 over the key at m/44'/60'/0'/1/0; used wherever prf-vault takes a PRF output. */
export function wordsVaultKey(phrase: string): Hex {
  const ikm = hdKeyToAccount(seedRoot(phrase), { changeIndex: 1 }).getHdKey().privateKey;
  if (!ikm) throw new Error('no private key');
  return bytesToHex(hkdf(sha256, ikm, utf8Encode(WORDS_VAULT_SALT), new Uint8Array(0), 32));
}

/** Three distinct positions 0-11, ascending. Rejection-samples bytes (no modulo bias). */
export function pickConfirmPositions(
  random: (n: number) => Uint8Array = randomBytes,
): [number, number, number] {
  const picked = new Set<number>();
  while (picked.size < 3) {
    for (const b of random(16)) {
      if (b >= 240) continue; // 240 = 20 x 12
      picked.add(b % WORD_COUNT);
      if (picked.size === 3) break;
    }
  }
  const [a, b, c] = [...picked].sort((x, y) => x - y);
  return [a, b, c];
}

export function confirmMatches(phrase: string, answers: Record<number, string>): boolean {
  const words = normalizePhrase(phrase).split(' ');
  const keys = Object.keys(answers);
  if (keys.length === 0) return false;
  return keys.every((k) => {
    const i = Number(k);
    return words[i] !== undefined && normalizePhrase(answers[i] ?? '') === words[i];
  });
}

export function phraseErrorMessage(r: {
  reason: 'count' | 'word' | 'checksum';
  badWords: string[];
}): string {
  if (r.reason === 'count') return 'Es müssen genau 12 Wörter sein.';
  if (r.reason === 'word') return `Dieses Wort kennen wir nicht: ${r.badWords.join(', ')}`;
  return 'Die Wörter passen nicht zusammen. Prüfe die Reihenfolge und die Schreibweise.';
}
