/**
 * useGuardianManager: the threshold every change asks for (W2 rules: never silently lower what is
 * on chain) and the words pool rule (I1: guardians this phone cannot classify block changes;
 * N2: only with the 'words' surface open and words seen on this phone).
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { getAddress, type Address } from 'viem';
import type { SponsoredCall } from '../userop';

const SAFE = getAddress('0x5afe00000000000000000000000000000000beef');
const P1 = getAddress('0x1111111111111111111111111111111111111111');
const P2 = getAddress('0x2222222222222222222222222222222222222222');
const P3 = getAddress('0x3333333333333333333333333333333333333333');
const W0 = getAddress('0x4444444444444444444444444444444444444440');

const mockChain: { guardians: Address[]; threshold: number } = { guardians: [], threshold: 0 };
const mockSent: SponsoredCall[][] = [];
const mockNames = new Map<string, string>();
/** This phone's key-value storage (words pool, pending marker, seen flag) and the 'words' gate. */
const mockKv = new Map<string, string>();
let mockSurfaceOpen = false;
const mockSuggested: { guardian: Address; approver: Address }[] = [];

jest.mock('thirdweb/react', () => ({ useActiveAccount: () => undefined }));
// Built lazily: the mock factories run before this file's top-level constants exist.
const mockStorage = () => ({
  getItem: async (k: string) => mockKv.get(k) ?? null,
  setItem: async (k: string, v: string) => void mockKv.set(k, v),
  removeItem: async (k: string) => void mockKv.delete(k),
});
jest.mock('@/lib/passkey/migration-runtime', () => ({
  get secureKeyValueStorage() {
    return mockStorage();
  },
}));
jest.mock('@/lib/passkey/gate', () => ({ isPasskeySurfaceAllowed: async () => mockSurfaceOpen }));
jest.mock('@/components/passkey/PasskeyUi', () => ({
  friendlyError: (e: unknown, fallback?: string) => (e instanceof Error ? e.message : fallback ?? null),
}));
jest.mock('@/lib/passkey/recovery-helper-runtime', () => ({ loadHelpers: async () => ({}) }));
jest.mock('@/lib/passkey/recovery-lookup', () => ({ suggestDefaultGuardians: async () => mockSuggested }));
// The runtime view = the real currentWordsPool on this phone's storage and gate, without a token read
// (the hook falls back to the same call when the runtime cannot be loaded).
jest.mock('@/lib/passkey/words-setup-runtime', () => ({
  wordsPoolView: async (guardians: Address[]) =>
    jest.requireActual('@/lib/passkey/words-setup').currentWordsPool(guardians, {
      storage: mockStorage(),
      wordsSurfaceOpen: async () => mockSurfaceOpen,
    }),
}));
jest.mock('@/lib/passkey/guardians-runtime', () => ({
  isAttester: async () => false,
  lookupChain: {},
  readGuardianState: async () => ({ guardians: [...mockChain.guardians], threshold: mockChain.threshold }),
  readIdentityMode: async () => 'safe',
  resolvePeopleNow: async (addresses: Address[]) =>
    new Map(
      addresses.map((a) => {
        const name = mockNames.get(a.toLowerCase());
        return [a.toLowerCase(), { address: a, name: name ?? 'Unbekannte Person', known: !!name, avatarUrl: null, profileWallet: null }];
      }),
    ),
  saveLabel: async () => undefined,
  sendOwnSafeOp: async (_r: unknown, _m: unknown, calls: SponsoredCall[]) => {
    mockSent.push(calls);
    return '0xabc';
  },
}));

import { managerThreshold, useGuardianManager } from '@/components/passkey/useGuardianManager';
import { planGuardianSet, WORDS_POOL_KEY } from '../words-guardians';
import { WORDS_NOT_LOADED_MESSAGE } from '../words-setup';

const RECORD = {
  credentialId: 'c',
  x: '0x01',
  y: '0x02',
  safe: SAFE,
  ownerType: 'webauthnSigner',
  owner: P3,
  legacy: getAddress('0x6666666666666666666666666666666666666666'),
  status: 'done',
} as never;

type Manager = ReturnType<typeof useGuardianManager>;

async function mount(): Promise<{ current: () => Manager }> {
  let latest!: Manager;
  function Probe() {
    latest = useGuardianManager(RECORD);
    return null;
  }
  await act(async () => {
    TestRenderer.create(<Probe />);
  });
  await act(async () => undefined);
  return { current: () => latest };
}

const expected = (people: Address[], threshold: number) =>
  planGuardianSet({ wallet: SAFE, current: mockChain.guardians, pool: null, people, words: false, threshold, currentThreshold: mockChain.threshold }).calls;

beforeEach(() => {
  mockSent.length = 0;
  mockNames.clear();
  mockSuggested.length = 0;
  mockKv.clear();
  mockSurfaceOpen = false;
});

/** An outdated local pool (none of it on chain): words were seen on this phone, the pool cannot classify. */
const OUTDATED = [0, 1, 2, 3, 4].map((i) => getAddress(`0x555555555555555555555555555555555555555${i}`));
const wordsSeenHere = () => mockKv.set(WORDS_POOL_KEY, JSON.stringify({ addresses: OUTDATED, confirmedAt: 1 }));

describe('managerThreshold (W2 rules)', () => {
  it('adopting the suggestion never lowers a stricter choice, and asks at least 2', () => {
    expect(managerThreshold.adopt(1)).toBe(2);
    expect(managerThreshold.adopt(3)).toBe(3);
  });
  it('add keeps the current value or the default, whichever is higher; remove clamps', () => {
    expect(managerThreshold.add(3, 4)).toBe(3);
    expect(managerThreshold.add(1, 3)).toBe(2);
    expect(managerThreshold.remove(3, 2)).toBe(2);
    expect(managerThreshold.helper(2, 0)).toBe(1);
  });
});

describe('useGuardianManager', () => {
  it('"Vorschlag übernehmen" keeps a stricter on-chain threshold (3 of 3 stays 3)', async () => {
    mockChain.guardians = [P1, P2];
    mockChain.threshold = 2;
    mockNames.set(P1.toLowerCase(), 'Erna').set(P2.toLowerCase(), 'Kurt').set(P3.toLowerCase(), 'Olaf');
    mockSuggested.push({ guardian: P3, approver: P3 });
    mockChain.threshold = 3;
    mockChain.guardians = [P1, P2, getAddress('0x7777777777777777777777777777777777777777')];
    mockNames.set('0x7777777777777777777777777777777777777777', 'Ida');
    const m = await mount();
    await act(async () => {
      await m.current().adoptSuggestion();
    });
    expect(mockSent).toHaveLength(1);
    expect(mockSent[0]).toEqual(expected([...mockChain.guardians, P3], 3));
  });

  it('"Vorschlag übernehmen" asks at least 2 when the chain has 1', async () => {
    mockChain.guardians = [P1];
    mockChain.threshold = 1;
    mockNames.set(P1.toLowerCase(), 'Erna').set(P3.toLowerCase(), 'Olaf');
    mockSuggested.push({ guardian: P3, approver: P3 });
    const m = await mount();
    await act(async () => {
      await m.current().adoptSuggestion();
    });
    expect(mockSent[0]).toEqual(expected([P1, P3], 2));
  });

  it('add and remove follow the same rules', async () => {
    mockChain.guardians = [P1, P2];
    mockChain.threshold = 2;
    mockNames.set(P1.toLowerCase(), 'Erna').set(P2.toLowerCase(), 'Kurt');
    const m = await mount();
    await act(async () => {
      await m.current().addGuardian(P3, 'Olaf');
    });
    expect(mockSent[0]).toEqual(expected([P1, P2, P3], 2));
    await act(async () => {
      await m.current().removeGuardian(P2);
    });
    expect(mockSent[1]).toEqual(expected([P1], 1));
  });

  it('pool unknown + an unnamed guardian: shown as words "nicht geladen", every change refused with the German hint', async () => {
    mockSurfaceOpen = true;
    wordsSeenHere();
    mockChain.guardians = [P1, W0];
    mockChain.threshold = 1;
    mockNames.set(P1.toLowerCase(), 'Erna');
    const m = await mount();
    expect(m.current().wordsUnloaded).toBe(true);
    expect(m.current().peopleGuardians).toEqual([P1]);
    await act(async () => {
      await m.current().addGuardian(P3, 'Olaf');
    });
    await act(async () => {
      await m.current().changeThreshold(1);
    });
    expect(mockSent).toHaveLength(0);
    expect(m.current().notice).toEqual({ tone: 'warning', text: WORDS_NOT_LOADED_MESSAGE });
  });

  describe('N2: the refusal needs the words surface open AND words seen on this phone', () => {
    const tryAdd = async () => {
      mockChain.guardians = [P1, W0];
      mockChain.threshold = 1;
      mockNames.set(P1.toLowerCase(), 'Erna');
      const m = await mount();
      await act(async () => {
        await m.current().addGuardian(P2, 'Kurt');
      });
      return m;
    };

    it('surface closed + unknown (words seen, no token): every guardian is a person, changes go through', async () => {
      mockSurfaceOpen = false;
      wordsSeenHere();
      const m = await tryAdd();
      expect(m.current().wordsUnloaded).toBe(false);
      expect(mockSent).toEqual([expected([P1, W0, P2], managerThreshold.add(1, 3))]);
    });

    it('surface open + nothing seen: changes go through', async () => {
      mockSurfaceOpen = true;
      const m = await tryAdd();
      expect(m.current().wordsUnloaded).toBe(false);
      expect(mockSent).toHaveLength(1);
    });

    it('surface open + words seen + unknown: still refused with the German hint', async () => {
      mockSurfaceOpen = true;
      wordsSeenHere();
      const m = await tryAdd();
      expect(m.current().wordsUnloaded).toBe(true);
      expect(mockSent).toHaveLength(0);
      expect(m.current().notice).toEqual({ tone: 'warning', text: WORDS_NOT_LOADED_MESSAGE });
    });
  });

  it('pool unknown but every guardian is a named person: changes go through', async () => {
    mockSurfaceOpen = true;
    wordsSeenHere();
    mockChain.guardians = [P1];
    mockChain.threshold = 1;
    mockNames.set(P1.toLowerCase(), 'Erna');
    const m = await mount();
    expect(m.current().wordsUnloaded).toBe(false);
    await act(async () => {
      await m.current().addGuardian(P2, 'Kurt');
    });
    expect(mockSent).toHaveLength(1);
  });
});
