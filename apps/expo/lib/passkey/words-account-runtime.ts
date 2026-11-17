/**
 * Real-world wiring for words-account.ts: the protected phrase store (expo-secure-store), the
 * session and record storage, and the Gnosis lookups (owner scan + recovery-words scan).
 */
import { findSafesByOwner } from './recovery-lookup';
import { findWalletsByWords } from './words-recovery';
import { lookupChain, wordsLookupChain } from './guardians-runtime';
import { secureKeyValueStorage } from './migration-runtime';
import { phraseStore } from './phrase-store-runtime';
import { randomBytes } from './random';
import { secureSessionStorage } from './signin-runtime';
import type { WordsAccountDeps } from './words-account';

export function createWordsAccountDeps(): WordsAccountDeps {
  return {
    phrase: phraseStore,
    sessionStorage: secureSessionStorage,
    migrationStorage: secureKeyValueStorage,
    findSafesByOwner: (owner) => findSafesByOwner(owner, lookupChain),
    findWalletsByWords: (pool) => findWalletsByWords(pool, wordsLookupChain),
    random: randomBytes,
  };
}
