/**
 * "Gerät ohne Fingerabdruck" settings section: each state's exact copy, grant / revoke wiring
 * (revoke behind a confirm), kill switch, eligibility, and never an address on screen.
 */
import React from 'react';
import { Alert, Text } from 'react-native';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('@/context/ThemeContext', () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      textPrimary: '#000', textSecondary: '#666', primary: '#00498B', surface: '#fff', surfaceSecondary: '#eee',
      error: '#c00', errorBackground: '#fee', success: '#0a0', successBackground: '#efe', warning: '#a60', warningBackground: '#ffe',
    },
  }),
}));

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('@/assets/icons/chevron-left.svg', () => () => null);

const mockEnabled = { value: true };
jest.mock('@/lib/supabase-app-settings', () => ({
  fetchPasskeySessionKeysEnabled: jest.fn(async () => mockEnabled.value),
}));
const mockGrant = {
  readDeviceSessionState: jest.fn(),
  grantDeviceSession: jest.fn(async () => ({})),
  revokeDeviceSessions: jest.fn(async () => undefined),
};
jest.mock('@/lib/passkey/session-keys/grant', () => ({
  readDeviceSessionState: (...a: unknown[]) => mockGrant.readDeviceSessionState(...a),
  grantDeviceSession: (...a: unknown[]) => (mockGrant.grantDeviceSession as jest.Mock)(...a),
  revokeDeviceSessions: (...a: unknown[]) => (mockGrant.revokeDeviceSessions as jest.Mock)(...a),
}));

import DeviceSessionSection from '../DeviceSessionSection';
import type { PasskeySession } from '@/lib/passkey/session';

const NOW = Math.floor(Date.now() / 1000);
const DAY = 86_400;
const PID_A = `0x${'a'.repeat(64)}`;
const PID_B = `0x${'b'.repeat(64)}`;

// Legacy identity (safe ≠ identity) with a passkey owner = eligible.
const SESSION = {
  safe: '0x1111111111111111111111111111111111111111',
  identity: '0x2222222222222222222222222222222222222222',
  credentialId: 'cred-1',
  ownerType: 'sharedSigner',
  x: '0x01',
  y: '0x02',
} as unknown as PasskeySession;

const record = (validUntil: number) => ({
  v: 1, safe: SESSION.safe, legacy: SESSION.identity, signer: '0x3333333333333333333333333333333333333333',
  validUntil, permissionIds: { personalMint: PID_A, groupMint: PID_B }, status: 'active',
});
const state = (over: Record<string, unknown> = {}) => ({
  layout: '7579', local: null, onChainPids: [], foreignPids: [], otherDeviceUntil: null, ...over,
});

const pad = (n: number) => String(n).padStart(2, '0');
const date = (sec: number) => {
  const d = new Date(sec * 1000);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
};

const texts = (r: ReactTestRenderer): string =>
  r.root
    .findAllByType(Text)
    .flatMap((n) => (Array.isArray(n.props.children) ? n.props.children : [n.props.children]))
    .filter((c): c is string => typeof c === 'string')
    .join('|');

const button = (r: ReactTestRenderer, label: string) =>
  r.root.find(
    (n) =>
      typeof n.props?.onPress === 'function' &&
      n.findAllByType(Text).some((t) => t.props.children === label),
  );

async function render(session: PasskeySession | null = SESSION) {
  let r!: ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(<DeviceSessionSection session={session} />);
  });
  await act(async () => {
    await Promise.resolve();
  });
  return r;
}

const ADDRESS_RE = /0x[0-9a-f]{6,}/i;

beforeEach(() => {
  mockEnabled.value = true;
  mockGrant.readDeviceSessionState.mockReset();
  mockGrant.grantDeviceSession.mockClear();
  mockGrant.revokeDeviceSessions.mockClear();
  jest.restoreAllMocks();
});

it('active: date, body, "Jetzt beenden" → confirm → revokeDeviceSessions once → "Beendet."', async () => {
  const until = NOW + 20 * DAY;
  mockGrant.readDeviceSessionState.mockResolvedValue(state({ local: record(until), onChainPids: [PID_A, PID_B] }));
  const r = await render();
  const t = texts(r);
  expect(t).toContain('Gerät ohne Fingerabdruck');
  expect(t).toContain(`Gerät ohne Fingerabdruck: aktiv bis ${date(until)}`);
  expect(t).toContain(
    'Diese App darf auf diesem Gerät Röbel Münzen für dich abholen, ohne nach deinem Fingerabdruck zu fragen. Für alles andere fragen wir weiter nach deinem Fingerabdruck.',
  );
  expect(t).not.toMatch(ADDRESS_RE);

  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await act(async () => {
    button(r, 'Jetzt beenden').props.onPress();
  });
  expect(mockGrant.revokeDeviceSessions).not.toHaveBeenCalled(); // confirm first
  const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
  mockGrant.readDeviceSessionState.mockResolvedValue(state());
  await act(async () => {
    buttons.find((b) => b.text === 'Beenden')?.onPress?.();
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(mockGrant.revokeDeviceSessions).toHaveBeenCalledTimes(1);
  expect(mockGrant.revokeDeviceSessions).toHaveBeenCalledWith(SESSION);
  expect(texts(r)).toContain('Beendet. Beim Abholen fragen wir wieder nach deinem Fingerabdruck.');
});

it('expired: "abgelaufen" + "Erneut erlauben" grants', async () => {
  mockGrant.readDeviceSessionState.mockResolvedValue(state({ local: record(NOW - 10), onChainPids: [PID_A, PID_B] }));
  const r = await render();
  expect(texts(r)).toContain('Gerät ohne Fingerabdruck: abgelaufen');
  await act(async () => {
    button(r, 'Erneut erlauben').props.onPress();
  });
  expect(mockGrant.grantDeviceSession).toHaveBeenCalledTimes(1);
  expect(mockGrant.grantDeviceSession).toHaveBeenCalledWith(SESSION);
});

it('off: "aus" + "Erlauben" grants, explainer names 30 days and the fingerprint for the rest', async () => {
  mockGrant.readDeviceSessionState.mockResolvedValue(state());
  const r = await render();
  const t = texts(r);
  expect(t).toContain('Gerät ohne Fingerabdruck: aus');
  expect(t).toContain('30 Tage');
  expect(t).toContain('Senden, Abstimmen');
  await act(async () => {
    button(r, 'Erlauben').props.onPress();
  });
  expect(mockGrant.grantDeviceSession).toHaveBeenCalledTimes(1);
});

it('other device: date + "Beenden" (confirmed) revokes', async () => {
  const until = NOW + 4 * DAY;
  mockGrant.readDeviceSessionState.mockResolvedValue(state({ onChainPids: [PID_A], foreignPids: [PID_A], otherDeviceUntil: until }));
  const r = await render();
  expect(texts(r)).toContain(`Auf einem anderen Gerät aktiv bis ${date(until)}`);
  expect(texts(r)).not.toMatch(ADDRESS_RE);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await act(async () => {
    button(r, 'Beenden').props.onPress();
  });
  const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
  await act(async () => {
    buttons.find((b) => b.text === 'Beenden')?.onPress?.();
  });
  expect(mockGrant.revokeDeviceSessions).toHaveBeenCalledTimes(1);
});

it('kill switch off: only an active session ("Jetzt beenden") is shown', async () => {
  mockEnabled.value = false;
  mockGrant.readDeviceSessionState.mockResolvedValue(state());
  const off = await render();
  expect(off.toJSON()).toBeNull();

  mockGrant.readDeviceSessionState.mockResolvedValue(state({ local: record(NOW + 10 * DAY), onChainPids: [PID_A, PID_B] }));
  const active = await render();
  expect(texts(active)).toContain('Jetzt beenden');
  expect(texts(active)).not.toContain('Erlauben');
});

it('hidden for ineligible sessions (no session, words owner, Safe identity) and unreadable state', async () => {
  mockGrant.readDeviceSessionState.mockResolvedValue(state());
  expect((await render(null)).toJSON()).toBeNull();
  expect((await render({ ...SESSION, ownerType: 'ecdsa' } as unknown as PasskeySession)).toJSON()).toBeNull();
  expect((await render({ ...SESSION, identity: SESSION.safe } as unknown as PasskeySession)).toJSON()).toBeNull();
  mockGrant.readDeviceSessionState.mockRejectedValue(new Error('rpc'));
  expect((await render()).toJSON()).toBeNull();
});
