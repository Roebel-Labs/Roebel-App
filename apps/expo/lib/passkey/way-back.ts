/**
 * The way-back rule: before a person becomes a citizen, an independent account needs a way back
 * (a lost phone must not take the Bürgerkarte with it). Pure rule + one reader; the chain and
 * SecureStore reads are injected (`readWayBack` deps), so this file has no native imports.
 *
 * Applies as soon as sign-up is open; it is NOT behind the `words` surface. Plan 3 feeds
 * `phraseConfirmed` (expert account) and plan 4 `backupFileExported`.
 */
import type { Address } from 'viem';
import { passkeySessionOf } from './active';
import { identityKind, type PasskeySession } from './session';
import { splitGuardians, type WordsPool } from './words-guardians';

export type AccountKind = 'provider' | 'passkey' | 'words';

export type WayBackFacts = {
  /** Guardians that are people (the words entry is not a person). */
  people: number;
  /** Recovery words are set up (their addresses are guardians). */
  wordsOn: boolean;
  /** Expert account: the phrase was written down and confirmed (plan 3). */
  phraseConfirmed?: boolean;
  /** Expert account: a backup file was exported (plan 4). */
  backupFileExported?: boolean;
};

export const WAY_BACK_REASON =
  'Bevor du Bürger wirst, braucht dein Konto einen Weg zurück. Sonst wäre deine Bürgerkarte weg, wenn du dein Handy verlierst.';
export const WAY_BACK_OFFLINE_MESSAGE = 'Keine Verbindung. Bitte versuche es erneut.';
export const ADD_PERSON_OPTION = { label: 'Vertrauensperson hinzufügen', route: '/settings/passkey' } as const;
export const SET_UP_WORDS_OPTION = { label: 'Wiederherstellungswörter einrichten', route: '/settings/recovery-words' } as const;

/** provider = Google, Apple or email login (a passkey session on a legacy identity counts too). */
export function hasWayBack(kind: AccountKind, f: WayBackFacts): boolean {
  switch (kind) {
    case 'provider':
      return true;
    case 'passkey':
      return f.people >= 1 || f.wordsOn;
    case 'words':
      return f.phraseConfirmed === true || f.backupFileExported === true || f.people >= 1;
  }
}

/** The quickest thing the person can do now. */
export function fastestWayBack(kind: AccountKind, wordsSurfaceOpen: boolean): { label: string; route: string } {
  if (kind === 'passkey' && wordsSurfaceOpen) return { ...SET_UP_WORDS_OPTION };
  return { ...ADD_PERSON_OPTION };
}

export type WayBackDeps = {
  readState: (safe: Address) => Promise<{ guardians: Address[]; threshold: number }>;
  loadPool: () => Promise<WordsPool | null>;
};

export type WayBackResult = { kind: AccountKind; ok: boolean } | { kind: AccountKind; ok: null };

/**
 * Reads the facts for `account` and applies the rule. `ok: null` = the chain read failed (never
 * treated as "has a way back"). A pool read failure degrades to "no pool" (word addresses then
 * count as people, which is still a real way back).
 */
export async function readWayBack(account: unknown, deps: WayBackDeps): Promise<WayBackResult> {
  const session = passkeySessionOf<PasskeySession>(account);
  if (!session || identityKind(session) === 'legacy') return { kind: 'provider', ok: true };
  try {
    const [state, pool] = await Promise.all([deps.readState(session.safe), deps.loadPool().catch(() => null)]);
    const { people, words } = splitGuardians(state.guardians, pool);
    return { kind: 'passkey', ok: hasWayBack('passkey', { people: people.length, wordsOn: words.length > 0 }) };
  } catch {
    return { kind: 'passkey', ok: null };
  }
}
