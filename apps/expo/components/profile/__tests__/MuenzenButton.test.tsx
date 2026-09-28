/**
 * The profile's Münzen pill, wired exactly like app/profile.tsx (useDailyMint → MuenzenButton).
 *
 * Passkey session: the pill looks like before (gold "+N Münzen", cooldown clock) and a tap claims
 * right there in the foreground through the provider's one-batch `claimNow` (one fingerprint),
 * pending while the prompt is open, then the usual claim animation. Cancel → claimable again,
 * no retry. thirdweb session: unchanged (optimistic, settlement queue).
 */
import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Alert } from 'react-native';

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

jest.mock('react-native-reanimated', () => {
  const RN = jest.requireActual('react-native');
  const anim = () => {
    const a: any = {};
    a.duration = () => a;
    return a;
  };
  const Easing: any = new Proxy({}, { get: () => (x: any) => x ?? ((t: number) => t) });
  return {
    __esModule: true,
    default: { View: RN.View, Text: RN.Text },
    FadeIn: anim(),
    FadeOut: anim(),
    LinearTransition: anim(),
    Easing,
    Extrapolation: {},
    interpolate: () => 0,
    useAnimatedStyle: (fn: () => object) => fn(),
    useReducedMotion: () => false,
    useSharedValue: (v: number) => ({ value: v, set(n: any) { this.value = typeof n === 'number' ? n : this.value; } }),
    withSpring: (v: number) => v,
    withTiming: (v: number) => v,
    withDelay: (_d: number, v: number) => v,
  };
});
jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: any) => children ?? null }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success' },
}));
jest.mock('@/context/ThemeContext', () => ({
  useTheme: () => ({
    isDark: false,
    colors: { surfaceSecondary: '#eee', surface: '#fff', textPrimary: '#000', textSecondary: '#666' },
  }),
}));
jest.mock('@/assets/icons/chevron-right.svg', () => () => null);
jest.mock('../CoinFlipBurst', () => {
  const { Text } = jest.requireActual('react-native');
  return ({ count }: { count: number }) => <Text testID="coin-burst">{`burst:${count}`}</Text>;
});

const mockTaler = {
  mintable: 2.4,
  minting: false,
  onboarded: true,
  talerBalance: 10,
  dailyMint: jest.fn(async () => undefined),
  enqueueSettlement: jest.fn(),
  claimNow: jest.fn(),
  account: { address: '0xc49dE63CcfeE46C6C5c3E393293f66779799Fb28' },
  passkeyClaim: true,
};
jest.mock('@/hooks/useRoebelTaler', () => ({ useRoebelTaler: () => mockTaler }));

import { useDailyMint } from '@/hooks/useDailyMint';
import MuenzenButton from '../MuenzenButton';

const onOpen = jest.fn();

// Mirrors app/profile.tsx's muenzenSlot.
function ProfileSlot() {
  const mint = useDailyMint({ isCitizen: true });
  if (mint.state === 'hidden') return null;
  return (
    <MuenzenButton
      state={mint.state}
      amount={mint.amount}
      onClaim={mint.claim}
      onOpen={onOpen}
      cooldownEnd={mint.cooldownEnd}
    />
  );
}

const mounted: ReactTestRenderer[] = [];
async function render(): Promise<ReactTestRenderer> {
  let r: ReactTestRenderer | null = null;
  await act(async () => {
    r = TestRenderer.create(<ProfileSlot />);
  });
  mounted.push(r as unknown as ReactTestRenderer);
  await act(async () => {
    await Promise.resolve();
  });
  return r as unknown as ReactTestRenderer;
}

const texts = (r: ReactTestRenderer): string[] =>
  r.root
    .findAll((n) => typeof n.type === 'string' && n.props && typeof n.props.children !== 'undefined')
    .flatMap((n) => (Array.isArray(n.props.children) ? n.props.children : [n.props.children]))
    .filter((c): c is string => typeof c === 'string');

const pill = (r: ReactTestRenderer) => r.root.find((n) => n.props?.accessibilityRole === 'button' && !!n.props.onPress);

async function tap(r: ReactTestRenderer) {
  await act(async () => {
    pill(r).props.onPress();
  });
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let alertSpy: jest.SpyInstance;
beforeEach(() => {
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  mockTaler.enqueueSettlement.mockClear();
  mockTaler.dailyMint.mockClear();
  mockTaler.claimNow.mockReset();
  onOpen.mockClear();
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => {
  // unmount clears the pill's animation timers and the cooldown clock
  act(() => {
    mounted.splice(0).forEach((r) => r.unmount());
  });
  alertSpy.mockRestore();
  jest.useRealTimers();
});

describe('Münzen pill — passkey session', () => {
  beforeEach(() => {
    mockTaler.passkeyClaim = true;
  });

  it('renders the gold amount, not the static "Münzen abholen" label', async () => {
    const r = await render();
    expect(texts(r)).toContain('+2 Münzen');
    expect(texts(r)).not.toContain('Münzen abholen');
    expect(pill(r).props.accessibilityLabel).toBe('+2 Münzen abholen');
  });

  it('tap claims once via the one-batch claim, pending while the prompt is open, then animates', async () => {
    const d = deferred<{ received: number; claimedAt: number; streak: number }>();
    mockTaler.claimNow.mockReturnValue(d.promise);
    const r = await render();

    await tap(r);
    expect(mockTaler.claimNow).toHaveBeenCalledTimes(1);
    expect(r.root.findAllByProps({ testID: 'muenzen-pending' }).length).toBeGreaterThan(0);
    expect(texts(r)).toContain('+2 Münzen'); // still the gold pill while pending

    // a second tap while pending does nothing
    await tap(r);
    expect(mockTaler.claimNow).toHaveBeenCalledTimes(1);

    await act(async () => {
      d.resolve({ received: 2, claimedAt: Date.now(), streak: 1 });
      await d.promise;
    });
    await act(async () => {
      await new Promise((res) => setTimeout(res, 60));
    });
    expect(r.root.findAllByProps({ testID: 'muenzen-pending' })).toHaveLength(0);
    expect(texts(r)).toContain('burst:2'); // the usual coin burst with the amount
    expect(mockTaler.enqueueSettlement).not.toHaveBeenCalled(); // never the background queue
    expect(mockTaler.dailyMint).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('after the claim the pill shows the cooldown countdown', async () => {
    jest.useFakeTimers();
    mockTaler.claimNow.mockResolvedValue({ received: 2, claimedAt: Date.now(), streak: 1 });
    const r = await render();
    await tap(r);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    // claim animation finishes → neutral pill with the cooldown label
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(texts(r)).toContain('Münzen');
    // label alternates to the MM:SS clock
    await act(async () => {
      jest.advanceTimersByTime(3500 + 300);
    });
    expect(texts(r).some((t) => /^\d{2}:\d{2}$/.test(t))).toBe(true);
    // idle tap opens the Münzen page, never claims again
    await tap(r);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(mockTaler.claimNow).toHaveBeenCalledTimes(1);
  });

  it('cancelled prompt: back to claimable, no alert, no retry', async () => {
    const err = Object.assign(new Error('cancelled'), { name: 'PasskeyCancelledError' });
    mockTaler.claimNow.mockRejectedValue(err);
    const r = await render();
    await tap(r);
    await act(async () => {
      await new Promise((res) => setTimeout(res, 20));
    });
    expect(mockTaler.claimNow).toHaveBeenCalledTimes(1);
    expect(r.root.findAllByProps({ testID: 'muenzen-pending' })).toHaveLength(0);
    expect(r.root.findAllByProps({ testID: 'coin-burst' })).toHaveLength(0);
    expect(texts(r)).toContain('+2 Münzen');
    expect(alertSpy).not.toHaveBeenCalled();
    expect(Object.keys(mockStore)).toEqual([]); // no cooldown written
  });

  it('failed claim: alert once, back to claimable, no retry', async () => {
    mockTaler.claimNow.mockRejectedValue(new Error('Netzwerkfehler'));
    const r = await render();
    await tap(r);
    await act(async () => {
      await new Promise((res) => setTimeout(res, 20));
    });
    expect(mockTaler.claimNow).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(texts(r)).toContain('+2 Münzen');
  });

  it('never claims on its own (no tap → no claim)', async () => {
    await render();
    await act(async () => {
      await new Promise((res) => setTimeout(res, 20));
    });
    expect(mockTaler.claimNow).not.toHaveBeenCalled();
    expect(mockTaler.dailyMint).not.toHaveBeenCalled();
  });
});

describe('Münzen pill — thirdweb session (unchanged)', () => {
  beforeEach(() => {
    mockTaler.passkeyClaim = false;
  });

  it('tap: optimistic claim through the settlement queue, animation right away', async () => {
    const r = await render();
    expect(texts(r)).toContain('+2 Münzen');
    await tap(r);
    await act(async () => {
      await new Promise((res) => setTimeout(res, 60));
    });
    expect(mockTaler.claimNow).not.toHaveBeenCalled();
    expect(mockTaler.enqueueSettlement).toHaveBeenCalledTimes(1);
    expect(mockTaler.enqueueSettlement.mock.calls[0][0]).toMatchObject({ label: 'Münzen', amount: 2, settle: mockTaler.dailyMint });
    expect(r.root.findAllByProps({ testID: 'muenzen-pending' })).toHaveLength(0);
    expect(texts(r)).toContain('burst:2');
  });
});
