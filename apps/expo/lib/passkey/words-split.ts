/**
 * The pure people/words split of on-chain guardians. Kept apart from words-guardians.ts (which
 * pulls in the SRM encoders → guardians.ts → userop/webauthn → native passkey modules) so that
 * way-back.ts, loaded by the citizenship screens for every login, stays free of native imports.
 * Only `viem` may be imported here.
 */
import { isAddressEqual, type Address } from 'viem';

/** The 5 word addresses in derivation order (index 0 first). */
export type WordsPool = { addresses: Address[]; confirmedAt: number };

/** On-chain guardians split into people and word addresses (case-insensitive, chain order kept). */
export function splitGuardians(onChain: readonly Address[], pool: WordsPool | null): { people: Address[]; words: Address[] } {
  const people: Address[] = [];
  const words: Address[] = [];
  for (const g of onChain) (pool && pool.addresses.some((a) => isAddressEqual(a, g)) ? words : people).push(g);
  return { people, words };
}
