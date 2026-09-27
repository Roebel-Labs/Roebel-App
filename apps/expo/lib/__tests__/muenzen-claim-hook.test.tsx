/**
 * The profile's Münzen button (useDailyMint): under a passkey session it NEVER hands a claim to
 * the background settlement queue (that fired two fingerprint prompts after the tap on the
 * 2026-09-27 device test). A thirdweb session keeps enqueueing exactly as before.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const mockStore: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockStore[k] ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockStore[k] = v;
  }),
  removeItem: jest.fn(async (k: string) => {
    delete mockStore[k];
  }),
}));

const mockTaler = {
  mintable: 2.4,
  minting: false,
  onboarded: true,
  talerBalance: 10,
  dailyMint: jest.fn(async () => undefined),
  enqueueSettlement: jest.fn(),
  account: { address: '0xc49dE63CcfeE46C6C5c3E393293f66779799Fb28' },
  passkeyClaim: false,
};
jest.mock('@/hooks/useRoebelTaler', () => ({ useRoebelTaler: () => mockTaler }));

import { useDailyMint } from '@/hooks/useDailyMint';

type Mint = ReturnType<typeof useDailyMint>;

async function renderMint(): Promise<{ current: () => Mint }> {
  let latest: Mint | null = null;
  function Harness() {
    latest = useDailyMint({ isCitizen: true });
    return null;
  }
  await act(async () => {
    TestRenderer.create(<Harness />);
  });
  // let the AsyncStorage read settle
  await act(async () => {
    await Promise.resolve();
  });
  return { current: () => latest as unknown as Mint };
}

beforeEach(() => {
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  mockTaler.enqueueSettlement.mockClear();
  mockTaler.dailyMint.mockClear();
});

describe('useDailyMint', () => {
  it('passkey session: claimable, but claim() refuses and nothing is enqueued or sent', async () => {
    mockTaler.passkeyClaim = true;
    const h = await renderMint();
    expect(h.current().state).toBe('claimable');
    expect(h.current().passkey).toBe(true);
    let ok = true;
    await act(async () => {
      ok = h.current().claim();
    });
    expect(ok).toBe(false);
    expect(mockTaler.enqueueSettlement).not.toHaveBeenCalled();
    expect(mockTaler.dailyMint).not.toHaveBeenCalled();
    expect(Object.keys(mockStore)).toEqual([]); // no optimistic cooldown written either
  });

  it('thirdweb session: unchanged — the claim goes to the settlement queue', async () => {
    mockTaler.passkeyClaim = false;
    const h = await renderMint();
    expect(h.current().passkey).toBe(false);
    let ok = false;
    await act(async () => {
      ok = h.current().claim();
    });
    expect(ok).toBe(true);
    expect(mockTaler.enqueueSettlement).toHaveBeenCalledTimes(1);
    expect(mockTaler.enqueueSettlement.mock.calls[0][0]).toMatchObject({ label: 'Münzen', amount: 2, settle: mockTaler.dailyMint });
  });
});
