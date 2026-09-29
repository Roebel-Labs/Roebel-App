import {
  applyAgeAnswer,
  buildPlan,
  canVoteDirectly,
  currentStep,
  isAgeConfirmed,
  neededSteps,
  parsePendingChoice,
  pendingChoiceKey,
  ageConfirmedKey,
  serializePendingChoice,
  stepPosition,
  AGE_CONFIRMED_VALUE,
  type VoteFlowState,
} from '@/lib/vote-flow';

const ready: VoteFlowState = {
  loggedIn: true,
  isCitizen: true,
  ageConfirmed: true,
  loading: false,
  hasKey: true,
  signedUp: true,
};

const POLL = '0xAbCdEf0000000000000000000000000000000001';

describe('vote flow steps', () => {
  it('everything done → vote directly, no sheet', () => {
    expect(neededSteps(ready)).toEqual(['vote']);
    expect(currentStep(ready)).toBe('vote');
    expect(canVoteDirectly(ready)).toBe(true);
  });

  it('logged out → login first, full path assumed', () => {
    const s = { ...ready, loggedIn: false, isCitizen: null, ageConfirmed: false, hasKey: false, signedUp: false };
    expect(currentStep(s)).toBe('login');
    expect(neededSteps(s)).toEqual(['login', 'age', 'key', 'signup', 'vote']);
    expect(canVoteDirectly(s)).toBe(false);
  });

  it('logged out with a key already on the device skips the key step', () => {
    const s = { ...ready, loggedIn: false, isCitizen: null, hasKey: true, signedUp: false };
    expect(neededSteps(s)).toEqual(['login', 'age', 'signup', 'vote']);
  });

  it('non-citizen → only the citizenship step (terminal)', () => {
    const s = { ...ready, isCitizen: false, ageConfirmed: false, hasKey: false, signedUp: false };
    expect(neededSteps(s)).toEqual(['citizen']);
    expect(currentStep(s)).toBe('citizen');
  });

  it('citizen check or key still loading → checking', () => {
    expect(currentStep({ ...ready, isCitizen: null })).toBe('checking');
    expect(currentStep({ ...ready, loading: true })).toBe('checking');
    expect(canVoteDirectly({ ...ready, loading: true })).toBe(false);
  });

  it('only the missing prerequisites, in order', () => {
    expect(neededSteps({ ...ready, ageConfirmed: false })).toEqual(['age', 'vote']);
    expect(neededSteps({ ...ready, hasKey: false, signedUp: false })).toEqual(['key', 'signup', 'vote']);
    expect(neededSteps({ ...ready, signedUp: false })).toEqual(['signup', 'vote']);
    expect(neededSteps({ ...ready, ageConfirmed: false, hasKey: false, signedUp: false })).toEqual([
      'age',
      'key',
      'signup',
      'vote',
    ]);
  });

  it('plan keeps completed steps so the numbering stays stable', () => {
    const start = { ...ready, ageConfirmed: false, hasKey: false, signedUp: false };
    expect(stepPosition(buildPlan([], start), currentStep(start))).toEqual({ index: 1, total: 4 });
    const afterAge = { ...start, ageConfirmed: true };
    const plan = buildPlan(['age'], afterAge);
    expect(plan).toEqual(['age', 'key', 'signup', 'vote']);
    expect(stepPosition(plan, currentStep(afterAge))).toEqual({ index: 2, total: 4 });
    const afterSignup = { ...afterAge, hasKey: true, signedUp: true };
    expect(stepPosition(buildPlan(['age', 'key', 'signup'], afterSignup), 'vote')).toEqual({
      index: 4,
      total: 4,
    });
  });

  it('after login the plan drops steps that turn out to be done', () => {
    const plan = buildPlan(['login'], ready);
    expect(plan).toEqual(['login', 'vote']);
    expect(stepPosition(plan, 'vote')).toEqual({ index: 2, total: 2 });
  });

  it('after login a non-citizen sees login + citizen', () => {
    expect(buildPlan(['login'], { ...ready, isCitizen: false })).toEqual(['login', 'citizen']);
  });

  it('stepPosition is null while checking', () => {
    expect(stepPosition(['vote'], 'checking')).toBeNull();
  });
});

describe('age confirmation', () => {
  it('16+ is persisted, under 16 is NOT persisted (no permanent block)', () => {
    expect(applyAgeAnswer('16-plus')).toEqual({ persist: true, blocked: false });
    expect(applyAgeAnswer('under-16')).toEqual({ persist: false, blocked: true });
  });

  it('under 16 then reopening: the age step is still needed and can be answered again', () => {
    const s = { ...ready, ageConfirmed: false };
    // under-16 persists nothing → state unchanged → age step comes back.
    const { persist } = applyAgeAnswer('under-16');
    const after = persist ? { ...s, ageConfirmed: true } : s;
    expect(currentStep(after)).toBe('age');
    const second = applyAgeAnswer('16-plus');
    expect(currentStep(second.persist ? { ...after, ageConfirmed: true } : after)).toBe('vote');
  });

  it('confirmed by the new flag or by a legacy birthdate', () => {
    expect(isAgeConfirmed(AGE_CONFIRMED_VALUE)).toBe(true);
    expect(isAgeConfirmed(null, '1990-01-01')).toBe(true);
    expect(isAgeConfirmed(null, '')).toBe(false);
    expect(isAgeConfirmed('under-16', null)).toBe(false);
    expect(isAgeConfirmed(undefined, undefined)).toBe(false);
  });

  it('age key is SecureStore-safe and per account', () => {
    expect(ageConfirmedKey('0xABC')).toBe('roebel.vote.age-confirmed.0xabc');
    expect(ageConfirmedKey('0xABC')).toMatch(/^[A-Za-z0-9._-]+$/);
  });
});

describe('remembered choice', () => {
  it('round-trips (survives a restart via SecureStore)', () => {
    const raw = serializePendingChoice(POLL, 1, 1000);
    expect(parsePendingChoice(raw, POLL)).toBe(1);
    expect(parsePendingChoice(raw, POLL.toLowerCase(), 1500, 2000)).toBe(1);
  });

  it('keeps Dagegen (0) — a falsy option must survive', () => {
    expect(parsePendingChoice(serializePendingChoice(POLL, 0, 1), POLL)).toBe(0);
  });

  it('rejects another poll, garbage, bad options, and an expired deadline', () => {
    const raw = serializePendingChoice(POLL, 2, 1000);
    expect(parsePendingChoice(raw, '0x0000000000000000000000000000000000000002')).toBeNull();
    expect(parsePendingChoice('not json', POLL)).toBeNull();
    expect(parsePendingChoice(null, POLL)).toBeNull();
    expect(parsePendingChoice(JSON.stringify({ pollAddress: POLL.toLowerCase(), option: 7 }), POLL)).toBeNull();
    expect(parsePendingChoice(raw, POLL, 3000, 2000)).toBeNull();
  });

  it('pending key is SecureStore-safe', () => {
    expect(pendingChoiceKey(POLL)).toMatch(/^[A-Za-z0-9._-]+$/);
  });
});
