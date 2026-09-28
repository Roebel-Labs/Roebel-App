/**
 * The profile's Münzen button (useDailyMint): under a passkey session it NEVER hands a claim to
 * the background settlement queue (that fired two fingerprint prompts after the tap on the
 * 2026-09-27 device test); it claims in the foreground via the one-batch `claimNow` instead.
 * A thirdweb session keeps enqueueing exactly as before.
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
  claimNow: jest.fn(async () => ({ received: 2, claimedAt: Date.now(), streak: 1 })),
  account: { address: '0xc49dE63CcfeE46C6C5c3E393293f66779799Fb28' },
  passkeyClaim: false,
};
jest.mock('@/hooks/useRoebelTaler', () => ({ useRoebelTaler: () => mockTaler }));

import { useDailyMint } from '@/hooks/useDailyMint';

type Mint = ReturnType<typeof useDailyMint>;

const renderers: TestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  act(() => {
    renderers.splice(0).forEach((r) => r.unmount());
  });
});

async function renderMint(): Promise<{ current: () => Mint }> {
  let latest: Mint | null = null;
  function Harness() {
    latest = useDailyMint({ isCitizen: true });
    return null;
  }
  await act(async () => {
    renderers.push(TestRenderer.create(<Harness />));
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
  mockTaler.claimNow.mockClear();
});

describe('useDailyMint', () => {
  it('passkey session: claim() runs the one-batch claimNow once, never the settlement queue', async () => {
    mockTaler.passkeyClaim = true;
    const h = await renderMint();
    expect(h.current().state).toBe('claimable');
    expect(h.current().passkey).toBe(true);
    let ok: boolean | Promise<boolean> = false;
    await act(async () => {
      ok = await h.current().claim();
    });
    expect(ok).toBe(true);
    expect(mockTaler.claimNow).toHaveBeenCalledTimes(1);
    expect(mockTaler.enqueueSettlement).not.toHaveBeenCalled();
    expect(mockTaler.dailyMint).not.toHaveBeenCalled();
    expect(Object.keys(mockStore)).toEqual([]); // nothing optimistic; claimNow persists on success
    expect(h.current().cooldownEnd).not.toBeNull(); // cooldown starts only after it landed
    expect(h.current().state).toBe('idle');
  });

  it('thirdweb session: unchanged — the claim goes to the settlement queue', async () => {
    mockTaler.passkeyClaim = false;
    const h = await renderMint();
    expect(h.current().passkey).toBe(false);
    let ok: boolean | Promise<boolean> = false;
    await act(async () => {
      ok = h.current().claim();
    });
    expect(ok).toBe(true);
    expect(mockTaler.claimNow).not.toHaveBeenCalled();
    expect(mockTaler.enqueueSettlement).toHaveBeenCalledTimes(1);
    expect(mockTaler.enqueueSettlement.mock.calls[0][0]).toMatchObject({ label: 'Münzen', amount: 2, settle: mockTaler.dailyMint });
  });
});
