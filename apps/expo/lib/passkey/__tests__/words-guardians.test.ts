jest.mock('react-native-passkey', () => ({ Passkey: { create: jest.fn(), get: jest.fn(), isSupported: () => true } }));

import { getAddress, type Address } from 'viem';
import { SOCIAL_RECOVERY_SENTINEL } from '../constants';
import { planAddGuardians, planChangeThreshold, planRemoveGuardian } from '../guardian-plan';
import { encodeAddGuardian, encodeChangeThreshold, encodeRevokeGuardian } from '../guardians';
import {
  WORDS_POOL_KEY,
  WORDS_THRESHOLD_LIMIT_MESSAGE,
  clearWordsPool,
  loadWordsPool,
  peopleThreshold,
  planGuardianSet,
  saveWordsPool,
  splitGuardians,
  type WordsPool,
} from '../words-guardians';

const addr = (n: number) => getAddress(`0x${n.toString(16).padStart(40, '0')}`);
const SAFE = addr(0xff);
const [P1, P2, P3, P4, P5, P6] = [0xa1, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6].map(addr);
const [W0, W1, W2, W3, W4] = [0xb0, 0xb1, 0xb2, 0xb3, 0xb4].map(addr);
const POOL: WordsPool = { addresses: [W0, W1, W2, W3, W4], confirmedAt: 1 };

describe('planGuardianSet', () => {
  it('switching words on with no people: one word guardian, threshold 1', () => {
    const r = planGuardianSet({ wallet: SAFE, current: [], pool: POOL, people: [], words: true });
    expect(r).toMatchObject({ threshold: 1, wordCount: 1 });
    expect(r.calls).toEqual([encodeAddGuardian(W0, 1)]);
  });

  it('adding a second person raises the threshold to 2 and adds a second word guardian in the same batch', () => {
    const r = planGuardianSet({ wallet: SAFE, current: [P1, W0], pool: POOL, people: [P1, P2], words: true });
    expect(r).toMatchObject({ threshold: 2, wordCount: 2 });
    expect(r.calls).toEqual([encodeAddGuardian(P2, 2), encodeAddGuardian(W1, 2)]);
  });

  it('raising the threshold with words on adds the next word guardian in the same op', () => {
    // list head-first after the adds of P1, P2, P3, W0, W1: [W1, W0, P3, P2, P1]
    const r = planGuardianSet({ wallet: SAFE, current: [W1, W0, P3, P2, P1], pool: POOL, people: [P1, P2, P3], words: true, threshold: 3 });
    expect(r).toMatchObject({ threshold: 3, wordCount: 3 });
    expect(r.calls).toEqual([encodeAddGuardian(W2, 3)]);
  });

  it('removing a person with words on keeps the words matching the new threshold in one op', () => {
    // 3 people at threshold 3 with 3 words → remove P3, threshold clamps to 2 → W2 goes too
    const current = [W2, W1, W0, P3, P2, P1];
    const r = planGuardianSet({ wallet: SAFE, current, pool: POOL, people: [P1, P2], words: true, threshold: 2 });
    expect(r).toMatchObject({ threshold: 2, wordCount: 2 });
    expect(r.calls).toEqual([encodeRevokeGuardian(SOCIAL_RECOVERY_SENTINEL, W2, 2), encodeRevokeGuardian(W0, P3, 2)]);
  });

  it('lowering the threshold removes the surplus word guardian with the right predecessor', () => {
    // list head-first: [W1, P2, P1, W0]
    const r = planGuardianSet({ wallet: SAFE, current: [W1, P2, P1, W0], pool: POOL, people: [P1, P2], words: true, threshold: 1 });
    expect(r.calls).toEqual([encodeRevokeGuardian(SOCIAL_RECOVERY_SENTINEL, W1, 1)]);
  });

  it('switching words off removes every word guardian and keeps the people threshold', () => {
    const r = planGuardianSet({ wallet: SAFE, current: [W1, P2, P1, W0], pool: POOL, people: [P1, P2], words: false });
    expect(r.wordCount).toBe(0);
    expect(r.calls).toEqual([encodeRevokeGuardian(SOCIAL_RECOVERY_SENTINEL, W1, 2), encodeRevokeGuardian(P1, W0, 2)]);
  });

  it('more than 5 required approvals with words on is refused', () => {
    expect(() =>
      planGuardianSet({ wallet: SAFE, current: [], pool: POOL, people: [P1, P2, P3, P4, P5, P6], words: true, threshold: 6 }),
    ).toThrow(WORDS_THRESHOLD_LIMIT_MESSAGE);
  });

  it('without a pool it plans exactly like the old planners', () => {
    const old = planAddGuardians({ wallet: SAFE, current: [P1], currentThreshold: 1, add: [P2] });
    expect(planGuardianSet({ wallet: SAFE, current: [P1], pool: null, people: [P1, P2], words: false }).calls).toEqual(old.calls);

    const oldMulti = planAddGuardians({ wallet: SAFE, current: [], currentThreshold: 0, add: [P1, P2, P3], threshold: 2 });
    expect(planGuardianSet({ wallet: SAFE, current: [], pool: null, people: [P1, P2, P3], words: false, threshold: 2 }).calls).toEqual(
      oldMulti.calls,
    );

    const oldRemove = planRemoveGuardian({ current: [P3, P2, P1], currentThreshold: 3, guardian: P2 });
    expect(planGuardianSet({ wallet: SAFE, current: [P3, P2, P1], pool: null, people: [P3, P1], words: false, threshold: 2 }).calls).toEqual([
      oldRemove.call,
    ]);

    const oldLast = planRemoveGuardian({ current: [P1], currentThreshold: 2, guardian: P1 });
    expect(planGuardianSet({ wallet: SAFE, current: [P1], pool: null, people: [], words: false, currentThreshold: 2 }).calls).toEqual([
      oldLast.call,
    ]);

    expect(planGuardianSet({ wallet: SAFE, current: [P3, P2, P1], pool: null, people: [P1, P2, P3], words: false, threshold: 3 }).calls).toEqual([
      planChangeThreshold(3, 3),
    ]);
  });

  it('a threshold change alone with words on is one changeThreshold when the word count already fits', () => {
    // same words, only the stored threshold differs (e.g. 1 → 2 with 2 words already present)
    const r = planGuardianSet({ wallet: SAFE, current: [W1, W0, P2, P1], pool: POOL, people: [P1, P2], words: true, threshold: 2 });
    expect(r.calls).toEqual([encodeChangeThreshold(2)]);
  });
});

describe('splitGuardians / peopleThreshold', () => {
  it('splitGuardians separates people from word addresses, case-insensitively', () => {
    expect(splitGuardians([P1, W0.toLowerCase() as Address], POOL)).toEqual({ people: [P1], words: [W0.toLowerCase()] });
  });
  it('without a pool everyone is a person', () => {
    expect(splitGuardians([P1, W0], null)).toEqual({ people: [P1, W0], words: [] });
  });
  it('peopleThreshold defaults to 2, clamps, never below 1', () => {
    expect(peopleThreshold(0)).toBe(1);
    expect(peopleThreshold(1)).toBe(1);
    expect(peopleThreshold(3)).toBe(2);
    expect(peopleThreshold(3, 5)).toBe(3);
    expect(peopleThreshold(3, 0)).toBe(1);
  });
});

describe('words pool storage', () => {
  const memory = () => {
    const m = new Map<string, string>();
    return {
      m,
      getItem: async (k: string) => m.get(k) ?? null,
      setItem: async (k: string, v: string) => void m.set(k, v),
      removeItem: async (k: string) => void m.delete(k),
    };
  };
  it('round-trips and clears', async () => {
    const s = memory();
    expect(await loadWordsPool(s)).toBeNull();
    await saveWordsPool(s, POOL);
    expect(s.m.has(WORDS_POOL_KEY)).toBe(true);
    expect(await loadWordsPool(s)).toEqual(POOL);
    await clearWordsPool(s);
    expect(await loadWordsPool(s)).toBeNull();
  });
  it('ignores a malformed pool', async () => {
    const s = memory();
    await s.setItem(WORDS_POOL_KEY, JSON.stringify({ addresses: [W0], confirmedAt: 1 }));
    expect(await loadWordsPool(s)).toBeNull();
    await s.setItem(WORDS_POOL_KEY, 'not json');
    expect(await loadWordsPool(s)).toBeNull();
  });
});
