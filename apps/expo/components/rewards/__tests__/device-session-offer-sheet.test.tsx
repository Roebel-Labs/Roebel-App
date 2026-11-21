/**
 * First-claim offer: the sheet's exact copy, and through useDeviceSessionOffer:
 * "Erlauben" → claimNow({ allowGrant: true }), "Nicht jetzt" → declineDeviceSession then claimNow(),
 * no sheet for any other claim path.
 */
import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('@/context/ThemeContext', () => ({
  useTheme: () => ({ isDark: false, colors: { textPrimary: '#000', textSecondary: '#666', primary: '#00498B' } }),
}));
jest.mock('@/components/BottomDrawer', () => ({
  __esModule: true,
  default: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => (visible ? children : null),
}));

const calls: string[] = [];
const mockTaler = {
  claimNow: jest.fn(async (opts?: { allowGrant?: boolean }) => {
    calls.push(opts?.allowGrant ? 'claimNow(allowGrant)' : 'claimNow()');
    return { received: 2, claimedAt: 1, streak: 1 };
  }),
  deviceSessionClaimPath: jest.fn(async () => 'offer'),
  declineDeviceSession: jest.fn(async () => {
    calls.push('decline');
  }),
};
jest.mock('@/hooks/useRoebelTaler', () => ({ useRoebelTaler: () => mockTaler }));

import DeviceSessionOfferSheet from '../DeviceSessionOfferSheet';
import { useDeviceSessionOffer } from '@/hooks/useDeviceSessionOffer';

const texts = (r: ReactTestRenderer): string =>
  r.root
    .findAllByType(Text)
    .flatMap((n) => (Array.isArray(n.props.children) ? n.props.children : [n.props.children]))
    .filter((c): c is string => typeof c === 'string')
    .join('|');

const press = (r: ReactTestRenderer, label: string) =>
  r.root.find((n) => n.props?.accessibilityLabel === label && typeof n.props.onPress === 'function');

type Offer = ReturnType<typeof useDeviceSessionOffer>;

async function renderFlow() {
  let latest: Offer | null = null;
  function Harness() {
    latest = useDeviceSessionOffer({ closeDelayMs: 0 });
    return <DeviceSessionOfferSheet {...latest.sheet} />;
  }
  let r!: ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(<Harness />);
  });
  return { r, offer: () => latest as unknown as Offer };
}

beforeEach(() => {
  calls.length = 0;
  mockTaler.claimNow.mockClear();
  mockTaler.declineDeviceSession.mockClear();
  mockTaler.deviceSessionClaimPath.mockImplementation(async () => 'offer');
});

it('renders the exact copy and never an address', async () => {
  let r!: ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(<DeviceSessionOfferSheet visible onAllow={jest.fn()} onLater={jest.fn()} onClose={jest.fn()} />);
  });
  const t = texts(r);
  expect(t).toContain('Münzen abholen ohne Fingerabdruck?');
  expect(t).toContain(
    'Die App darf 30 Tage lang auf diesem Gerät Röbel Münzen für dich abholen, ohne Fingerabdruck. Dafür wird dein Konto einmal aktualisiert. Für alles andere (Senden, Abstimmen, Bestätigungen, Kontoänderungen) fragen wir weiter nach deinem Fingerabdruck.',
  );
  expect(t).toContain('Erlauben');
  expect(t).toContain('Nicht jetzt');
  expect(t).not.toMatch(/0x[0-9a-f]{6,}/i);
});

it('"Erlauben" claims with allowGrant: true, once', async () => {
  const { r, offer } = await renderFlow();
  let pending!: Promise<unknown>;
  await act(async () => {
    pending = offer().claim();
  });
  expect(texts(r)).toContain('Münzen abholen ohne Fingerabdruck?');
  expect(mockTaler.claimNow).not.toHaveBeenCalled();
  await act(async () => {
    press(r, 'Erlauben').props.onPress();
    await pending;
  });
  expect(calls).toEqual(['claimNow(allowGrant)']);
  expect(mockTaler.claimNow).toHaveBeenCalledWith({ allowGrant: true });
  expect(texts(r)).not.toContain('Münzen abholen ohne Fingerabdruck?');
});

it('"Nicht jetzt" declines, then claims with the passkey', async () => {
  const { r, offer } = await renderFlow();
  let pending!: Promise<unknown>;
  await act(async () => {
    pending = offer().claim();
  });
  await act(async () => {
    press(r, 'Nicht jetzt').props.onPress();
    await pending;
  });
  expect(calls).toEqual(['decline', 'claimNow()']);
});

it('swiping the sheet away claims nothing', async () => {
  const { r, offer } = await renderFlow();
  let pending!: Promise<unknown>;
  await act(async () => {
    pending = offer().claim();
  });
  let result: unknown;
  await act(async () => {
    offer().sheet.onClose();
    result = await pending;
  });
  expect(result).toBeNull();
  expect(calls).toEqual([]);
  expect(texts(r)).toBe('');
});

it('no sheet when the path is not "offer"', async () => {
  mockTaler.deviceSessionClaimPath.mockImplementation(async () => 'session');
  const { r, offer } = await renderFlow();
  await act(async () => {
    await offer().claim();
  });
  expect(calls).toEqual(['claimNow()']);
  expect(texts(r)).toBe('');
});
