/**
 * Recovery words as guardians: the 12 words derive a pool of 5 addresses (words.ts); the first
 * `t` of them are guardians of the Safe, where `t` is the people threshold. Then the words alone
 * reach the threshold (still with the 3-day wait), and any `t` people still do too.
 *
 * `planGuardianSet` turns "these people, words on/off, this threshold" into the SRM calls of ONE
 * op, so the number of word guardians always follows the threshold (spec 5.3).
 *
 * The device stores only the 5 public addresses (never the words).
 */
import { getAddress, isAddressEqual, type Address } from 'viem';
import { SOCIAL_RECOVERY_SENTINEL } from './constants';
import { clampThreshold, defaultThreshold } from './guardian-plan';
import { encodeAddGuardian, encodeChangeThreshold, encodeRevokeGuardian } from './guardians';
import type { KeyValueStorage } from './migration';
import type { SponsoredCall } from './userop';
import { WORDS_POOL_SIZE } from './words';
import type { WordsPool } from './words-split';

export const WORDS_POOL_KEY = 'passkey_words_pool_v1';

export const WORDS_THRESHOLD_LIMIT_MESSAGE = 'Mit Wiederherstellungswörtern können höchstens 5 Personen zustimmen müssen.';

export { splitGuardians, type WordsPool } from './words-split';

type RemovableStorage = KeyValueStorage & { removeItem?: (key: string) => Promise<void> };

const same = (a: Address, b: Address) => isAddressEqual(a, b);
const includesAddr = (list: readonly Address[], a: Address) => list.some((x) => same(x, a));

export async function loadWordsPool(storage: KeyValueStorage): Promise<WordsPool | null> {
  const raw = await storage.getItem(WORDS_POOL_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<WordsPool>;
    if (!Array.isArray(parsed?.addresses) || parsed.addresses.length !== WORDS_POOL_SIZE) return null;
    if (typeof parsed.confirmedAt !== 'number') return null;
    return { addresses: parsed.addresses.map((a) => getAddress(a)), confirmedAt: parsed.confirmedAt };
  } catch {
    return null;
  }
}

export async function saveWordsPool(storage: KeyValueStorage, pool: WordsPool): Promise<void> {
  if (pool.addresses.length !== WORDS_POOL_SIZE) throw new Error(`a words pool has exactly ${WORDS_POOL_SIZE} addresses`);
  await storage.setItem(WORDS_POOL_KEY, JSON.stringify({ addresses: pool.addresses.map((a) => getAddress(a)), confirmedAt: pool.confirmedAt }));
}

export async function clearWordsPool(storage: RemovableStorage): Promise<void> {
  if (storage.removeItem) await storage.removeItem(WORDS_POOL_KEY);
  else await storage.setItem(WORDS_POOL_KEY, '');
}

/** How many must agree for `peopleCount` people: the wanted value (default 2) clamped, never below 1. */
export function peopleThreshold(peopleCount: number, wanted?: number): number {
  return clampThreshold(wanted ?? defaultThreshold(peopleCount), Math.max(peopleCount, 1));
}

/**
 * The SRM calls that turn `current` (in `readGuardians` order, head-first) into
 * people ∪ (words ? first t pool addresses : ∅) with threshold t. Adds first (people in the given
 * order, then words in pool order), then revokes in list order, each carrying a threshold valid at
 * that point; a final changeThreshold(t) when the last call did not already set t.
 *
 * `currentThreshold` (the stored SRM threshold) is only needed when the last guardian goes: the
 * module then keeps the stored value.
 */
export function planGuardianSet(p: {
  wallet: Address;
  current: readonly Address[];
  pool: WordsPool | null;
  people: readonly Address[];
  words: boolean;
  threshold?: number;
  currentThreshold?: number;
}): { calls: SponsoredCall[]; threshold: number; wordCount: number } {
  const people: Address[] = [];
  for (const raw of p.people) {
    const a = getAddress(raw);
    if (same(a, p.wallet) || same(a, SOCIAL_RECOVERY_SENTINEL) || /^0x0{40}$/i.test(a)) continue;
    if (includesAddr(people, a)) continue;
    people.push(a);
  }
  const t = peopleThreshold(people.length, p.threshold);
  if (p.words && t > WORDS_POOL_SIZE) throw new Error(WORDS_THRESHOLD_LIMIT_MESSAGE);
  if (p.words && !p.pool) throw new Error('words need a words pool');

  const wordSet = p.words && p.pool ? p.pool.addresses.slice(0, t).map((a) => getAddress(a)) : [];
  const desired = [...people, ...wordSet.filter((w) => !includesAddr(people, w))];

  const list: Address[] = p.current.map((a) => getAddress(a));
  const calls: SponsoredCall[] = [];
  let stored = p.currentThreshold;
  let last: number | null = null;

  for (const g of desired) {
    if (includesAddr(list, g)) continue;
    list.unshift(g);
    const th = Math.min(t, list.length);
    calls.push(encodeAddGuardian(g, th));
    stored = last = th;
  }

  for (const g of [...list]) {
    if (includesAddr(desired, g)) continue;
    const i = list.findIndex((x) => same(x, g));
    const prev = i === 0 ? SOCIAL_RECOVERY_SENTINEL : list[i - 1];
    list.splice(i, 1);
    const th = list.length === 0 ? Math.max(1, stored ?? t) : Math.min(t, list.length);
    calls.push(encodeRevokeGuardian(prev, g, th));
    stored = last = th;
  }

  if (desired.length > 0 && (calls.length === 0 || last !== t)) calls.push(encodeChangeThreshold(t));

  return { calls, threshold: t, wordCount: wordSet.length };
}
