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

/** SecureStore key (charset [A-Za-z0-9._-]) for the per-account age flag. */
export function ageConfirmedKey(address: string): string {
  return `roebel.vote.age-confirmed.${address.toLowerCase()}`;
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
