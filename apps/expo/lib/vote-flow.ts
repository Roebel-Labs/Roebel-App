/**
 * Pure step machine for the Bürgerumfrage vote sheet (components/VoteFlowSheet).
 *
 * The vote options are always visible. A tap remembers the choice and opens
 * ONE sheet that walks through only the prerequisites still missing, in a
 * fixed order: login → citizenship → age → voting key → signup → vote.
 *
 * No React / RN imports here so the logic is unit-testable in isolation.
 */

export type VoteFlowStep = 'login' | 'citizen' | 'age' | 'key' | 'signup' | 'vote';

/** Canonical order of the steps. */
export const VOTE_FLOW_ORDER: readonly VoteFlowStep[] = [
  'login',
  'citizen',
  'age',
  'key',
  'signup',
  'vote',
];

export interface VoteFlowState {
  loggedIn: boolean;
  /** null = the CitizenNFT check is still in flight. */
  isCitizen: boolean | null;
  ageConfirmed: boolean;
  /** true while the on-device voting key / age flag are still loading. */
  loading: boolean;
  hasKey: boolean;
  signedUp: boolean;
}

/** Ordered list of steps still needed for this state. Always ends with 'vote'
 *  — except for a known non-citizen, where 'citizen' is the terminal step. */
export function neededSteps(s: VoteFlowState): VoteFlowStep[] {
  if (!s.loggedIn) {
    // Nothing else is knowable before login; assume the full path. It is
    // trimmed by nextPlan() once the account's real state is known.
    const out: VoteFlowStep[] = ['login', 'age'];
    if (!s.hasKey) out.push('key');
    out.push('signup', 'vote');
    return out;
  }
  if (s.isCitizen === false) return ['citizen'];
  const out: VoteFlowStep[] = [];
  if (!s.ageConfirmed) out.push('age');
  if (!s.hasKey) out.push('key');
  if (!s.signedUp) out.push('signup');
  out.push('vote');
  return out;
}

/** What the sheet shows right now. 'checking' = wait (state still loading). */
export function currentStep(s: VoteFlowState): VoteFlowStep | 'checking' {
  if (!s.loggedIn) return 'login';
  if (s.isCitizen === null || s.loading) return 'checking';
  return neededSteps(s)[0];
}

/**
 * The steps shown in the progress ("Schritt 3 von 4"): the steps the person
 * already completed in THIS run of the sheet plus the ones still needed, in
 * canonical order. Steps discovered to be unnecessary (e.g. an existing
 * signup found after login) drop out; newly required ones (e.g. 'citizen'
 * after login) are inserted.
 */
export function buildPlan(completed: readonly VoteFlowStep[], s: VoteFlowState): VoteFlowStep[] {
  const merged = new Set<VoteFlowStep>([...completed, ...neededSteps(s)]);
  return VOTE_FLOW_ORDER.filter((step) => merged.has(step));
}

/** "Schritt 2 von 4" position for the current step, or null when unknown. */
export function stepPosition(
  plan: readonly VoteFlowStep[],
  step: VoteFlowStep | 'checking',
): { index: number; total: number } | null {
  if (step === 'checking') return null;
  const i = plan.indexOf(step);
  if (i < 0) return null;
  return { index: i + 1, total: plan.length };
}

/** True when the tap can cast the vote directly, without opening the sheet. */
export function canVoteDirectly(s: VoteFlowState): boolean {
  return currentStep(s) === 'vote';
}

// ---------------------------------------------------------------------------
// Age confirmation
// ---------------------------------------------------------------------------

export type AgeAnswer = '16-plus' | 'under-16';

/**
 * Outcome of an age answer. "16 oder älter" is persisted (one flag, no
 * birthdate). "Jünger als 16" is NEVER persisted: it only blocks this run of
 * the sheet, so the person can reopen the flow and answer again.
 */
export function applyAgeAnswer(answer: AgeAnswer): { persist: boolean; blocked: boolean } {
  return answer === '16-plus'
    ? { persist: true, blocked: false }
    : { persist: false, blocked: true };
}

/** Age counts as confirmed with the new flag OR a legacy on-device birthdate
 *  (entered via the old date picker / verification form). */
export function isAgeConfirmed(flag: string | null | undefined, legacyBirthdate?: string | null): boolean {
  return flag === AGE_CONFIRMED_VALUE || !!(legacyBirthdate && legacyBirthdate.trim());
}

export const AGE_CONFIRMED_VALUE = '16-plus';

/** SecureStore / AsyncStorage key (charset [A-Za-z0-9._-]) for the per-account
 *  age flag. Always lower-cased, so a checksummed and a lower-case address of
 *  the same account share one flag. */
export function ageConfirmedKey(address: string): string {
  return `roebel.vote.age-confirmed.${address.toLowerCase()}`;
}

/** Device-level age flag: once ANY account on this device confirmed 16+, the
 *  question is never asked again (also after a thirdweb ↔ passkey switch,
 *  where the active address can differ). */
export const AGE_CONFIRMED_DEVICE_KEY = 'roebel.vote.age-confirmed.device';

/** Storage the age flag is read from / written to (injected for tests). */
export interface AgeFlagStorage {
  /** expo-secure-store (the original home of the per-account flag). */
  secureGet: (key: string) => Promise<string | null>;
  secureSet: (key: string, value: string) => Promise<void>;
  /** AsyncStorage (survives where the keychain read fails). */
  asyncGet: (key: string) => Promise<string | null>;
  asyncSet: (key: string, value: string) => Promise<void>;
  /** Legacy birthdate from the old date picker / verification form. */
  loadBirthdate?: (address: string) => Promise<string | null | undefined>;
}

async function safeGet(get: (k: string) => Promise<string | null>, key: string): Promise<string | null> {
  try {
    return await get(key);
  } catch {
    return null;
  }
}

/**
 * Was 16+ ever confirmed on this device? Any of: the device flag, the
 * per-account flag (AsyncStorage or SecureStore — the old key keeps working),
 * or a legacy birthdate. A hit on an older source back-fills the device flag
 * so the next read is a single AsyncStorage lookup.
 */
export async function readAgeConfirmed(address: string | null | undefined, st: AgeFlagStorage): Promise<boolean> {
  const hit = (v: string | null) => v === AGE_CONFIRMED_VALUE;
  if (hit(await safeGet(st.asyncGet, AGE_CONFIRMED_DEVICE_KEY))) return true;
  let confirmed = false;
  if (address) {
    const key = ageConfirmedKey(address);
    confirmed = hit(await safeGet(st.asyncGet, key)) || hit(await safeGet(st.secureGet, key));
    if (!confirmed && st.loadBirthdate) {
      let birthdate: string | null | undefined = null;
      try {
        birthdate = await st.loadBirthdate(address);
      } catch {
        birthdate = null;
      }
      confirmed = isAgeConfirmed(null, birthdate);
    }
  }
  if (confirmed) {
    await st.asyncSet(AGE_CONFIRMED_DEVICE_KEY, AGE_CONFIRMED_VALUE).catch(() => undefined);
  }
  return confirmed;
}

/** Persist "16 oder älter" everywhere it is read from. Never throws: a failed
 *  write only means the flag lives in the other stores. */
export async function persistAgeConfirmed(address: string | null | undefined, st: AgeFlagStorage): Promise<void> {
  const writes: Promise<unknown>[] = [st.asyncSet(AGE_CONFIRMED_DEVICE_KEY, AGE_CONFIRMED_VALUE)];
  if (address) {
    const key = ageConfirmedKey(address);
    writes.push(st.asyncSet(key, AGE_CONFIRMED_VALUE), st.secureSet(key, AGE_CONFIRMED_VALUE));
  }
  await Promise.allSettled(writes);
}

// ---------------------------------------------------------------------------
// Remembered choice (survives an app restart mid-flow)
// ---------------------------------------------------------------------------

export interface PendingChoice {
  pollAddress: string; // lower-cased
  option: number; // VoteType: 0=Against, 1=For, 2=Abstain
  savedAt: number; // epoch seconds
}

/** SecureStore key for the remembered choice on one poll. */
export function pendingChoiceKey(pollAddress: string): string {
  return `roebel.vote.pending.${pollAddress.toLowerCase()}`;
}

export function serializePendingChoice(pollAddress: string, option: number, nowSec: number): string {
  const c: PendingChoice = { pollAddress: pollAddress.toLowerCase(), option, savedAt: nowSec };
  return JSON.stringify(c);
}

/**
 * Parse a stored choice. Returns null for garbage, a different poll, an
 * invalid option, or when the poll's deadline has passed.
 */
export function parsePendingChoice(
  raw: string | null | undefined,
  pollAddress: string,
  nowSec?: number,
  deadlineSec?: number,
): number | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as Partial<PendingChoice>;
    if (!c || typeof c.option !== 'number' || typeof c.pollAddress !== 'string') return null;
    if (c.pollAddress !== pollAddress.toLowerCase()) return null;
    if (c.option !== 0 && c.option !== 1 && c.option !== 2) return null;
    if (nowSec !== undefined && deadlineSec !== undefined && nowSec > deadlineSec) return null;
    return c.option;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// No second confirmation: the tapped option IS the decision
// ---------------------------------------------------------------------------

/**
 * Should the sheet cast the vote on its own right now? Yes once the 'vote'
 * step is reached with a remembered choice — there is no "Wirklich …?" tap.
 * Never while something else runs, after an error (the person retries with
 * the button), or twice in one run of the sheet.
 */
export function shouldAutoCast(args: {
  sheetOpen: boolean;
  step: VoteFlowStep | 'checking';
  choice: number | null;
  busy: boolean;
  hasError: boolean;
  alreadyAttempted: boolean;
  /** Everything castVote needs is loaded (poll, signed-up state, wallet). */
  ready: boolean;
}): boolean {
  return (
    args.sheetOpen &&
    args.step === 'vote' &&
    args.choice !== null &&
    !args.busy &&
    !args.hasError &&
    !args.alreadyAttempted &&
    args.ready
  );
}

// ---------------------------------------------------------------------------
// Own vote shown right after casting (optimistic record)
// ---------------------------------------------------------------------------

export interface LocalVoteRecord {
  pollAddress: string; // lower-cased
  optionIndex: number;
  nonce: string;
  /** '' while the ballot is still being sent (optimistic record). */
  txHash: string;
  votedAt: number; // epoch seconds
}

/**
 * The vote to show for a poll: the optimistic (just cast, still settling)
 * record when it is at least as new as the confirmed one, else the confirmed
 * record. The optimistic record never feeds the nonce (see getNextNonce).
 */
export function pickLastVote<T extends LocalVoteRecord>(confirmed: T | null | undefined, pending: T | null | undefined): T | null {
  if (pending && (!confirmed || pending.votedAt >= confirmed.votedAt)) return pending;
  return confirmed ?? null;
}

// ---------------------------------------------------------------------------
// Voting key (MACI keypair) reuse
// ---------------------------------------------------------------------------

/** Device slot of the MACI keypair (unchanged since v1 — keep reading it). */
export const MACI_KEYPAIR_DEVICE_KEY = 'roebel.maci.keypair.v1';

/** Per-account copy of the MACI keypair (SecureStore charset [A-Za-z0-9._-]).
 *  The key is per account and its SignUp is per MACI core, so ONE stored key
 *  serves every poll — it is never re-derived for a new proposal. */
export function maciKeypairAccountKey(address: string): string {
  return `${MACI_KEYPAIR_DEVICE_KEY}.${address.toLowerCase()}`;
}

/**
 * Which stored keypair JSON to use: the active account's own copy first, else
 * the device slot (exactly the behaviour before the per-account copy existed,
 * so nobody has to re-create a key). Returns null when neither parses.
 */
export function chooseStoredKeypair(accountRaw: string | null, deviceRaw: string | null): { raw: string; source: 'account' | 'device' } | null {
  const ok = (raw: string | null) => {
    if (!raw) return false;
    try {
      const v = JSON.parse(raw);
      return !!v && typeof v.pubX === 'string' && typeof v.pubY === 'string';
    } catch {
      return false;
    }
  };
  if (ok(accountRaw)) return { raw: accountRaw as string, source: 'account' };
  if (ok(deviceRaw)) return { raw: deviceRaw as string, source: 'device' };
  return null;
}
