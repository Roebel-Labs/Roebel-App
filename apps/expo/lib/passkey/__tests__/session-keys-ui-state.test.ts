/**
 * UI decisions for "Gerät ohne Fingerabdruck": the settings state, the date format and the
 * first-claim offer flow around claimNow.
 */
import type { Hex } from 'viem';
import type { DeviceSessionState } from '../session-keys/grant';
import type { DeviceSessionRecord } from '../session-keys/device-key';
import {
  claimWithDeviceSessionOffer,
  deviceSessionView,
  formatSessionDate,
} from '../session-keys/ui-state';

const NOW = 1_800_000_000;
const DAY = 86_400;
const PID_A = `0x${'a'.repeat(64)}` as Hex;
const PID_B = `0x${'b'.repeat(64)}` as Hex;
const PID_X = `0x${'c'.repeat(64)}` as Hex;

const record = (over: Partial<DeviceSessionRecord> = {}): DeviceSessionRecord => ({
  v: 1,
  safe: `0x${'1'.repeat(40)}`,
  legacy: `0x${'2'.repeat(40)}`,
  signer: `0x${'3'.repeat(40)}`,
  validUntil: NOW + 20 * DAY,
  permissionIds: { personalMint: PID_A, groupMint: PID_B } as DeviceSessionRecord['permissionIds'],
  status: 'active',
  ...over,
});

const state = (over: Partial<DeviceSessionState> = {}): DeviceSessionState => ({
  layout: '7579',
  local: null,
  onChainPids: [],
  foreignPids: [],
  otherDeviceUntil: null,
  ...over,
});

describe('deviceSessionView', () => {
  const v = (p: Partial<Parameters<typeof deviceSessionView>[0]>) =>
    deviceSessionView({ enabled: true, eligible: true, state: state(), nowSec: NOW, ...p });

  it.each([
    ['not eligible', { eligible: false, state: state({ local: record() }) }, { kind: 'hidden' }],
    ['state unreadable', { state: null }, { kind: 'hidden' }],
    ['active', { state: state({ local: record() }) }, { kind: 'active', until: NOW + 20 * DAY }],
    ['active, kill switch off (can still be ended)', { enabled: false, state: state({ local: record() }) }, { kind: 'active', until: NOW + 20 * DAY }],
    ['expired', { state: state({ local: record({ validUntil: NOW - 1 }) }) }, { kind: 'expired' }],
    ['expired, kill switch off', { enabled: false, state: state({ local: record({ validUntil: NOW - 1 }) }) }, { kind: 'hidden' }],
    ['pending record = off', { state: state({ local: record({ status: 'pending' }) }) }, { kind: 'off' }],
    ['nothing', {}, { kind: 'off' }],
    ['nothing, kill switch off', { enabled: false }, { kind: 'hidden' }],
    ['other device', { state: state({ foreignPids: [PID_X], otherDeviceUntil: NOW + 5 * DAY }) }, { kind: 'other', until: NOW + 5 * DAY }],
    ['other device expired', { state: state({ foreignPids: [PID_X], otherDeviceUntil: NOW - 5 }) }, { kind: 'off' }],
    ['other device unreadable', { state: state({ foreignPids: [PID_X], otherDeviceUntil: null }) }, { kind: 'off' }],
    ['other device, kill switch off', { enabled: false, state: state({ foreignPids: [PID_X], otherDeviceUntil: NOW + DAY }) }, { kind: 'hidden' }],
  ])('%s', (_name, p, expected) => {
    expect(v(p as Partial<Parameters<typeof deviceSessionView>[0]>)).toEqual(expected);
  });
});

it('formatSessionDate prints dd.MM.yyyy', () => {
  const sec = Math.floor(new Date(2026, 11, 3, 12, 0, 0).getTime() / 1000);
  expect(formatSessionDate(sec)).toBe('03.12.2026');
});

describe('claimWithDeviceSessionOffer', () => {
  const RESULT = { received: 3 };
  const deps = (path: string | Error | undefined, choice: 'grant' | 'decline' | 'dismiss' = 'grant') => {
    const calls: string[] = [];
    return {
      calls,
      d: {
        claimPath:
          path === undefined
            ? undefined
            : jest.fn(async () => {
                if (path instanceof Error) throw path;
                return path as never;
              }),
        claimNow: jest.fn(async (opts?: { allowGrant?: boolean }) => {
          calls.push(opts?.allowGrant ? 'claimNow(allowGrant)' : 'claimNow()');
          return RESULT;
        }),
        decline: jest.fn(async () => {
          calls.push('decline');
        }),
        askOffer: jest.fn(async () => {
          calls.push('ask');
          return choice;
        }),
      },
    };
  };

  it.each(['passkey', 'session', 'renew-then-session'])('path %s → plain claimNow(), no sheet', async (path) => {
    const { d, calls } = deps(path);
    await expect(claimWithDeviceSessionOffer(d)).resolves.toBe(RESULT);
    expect(calls).toEqual(['claimNow()']);
  });

  it('a failing or missing path read keeps today\'s claim', async () => {
    for (const p of [new Error('rpc'), undefined]) {
      const { d, calls } = deps(p);
      await claimWithDeviceSessionOffer(d);
      expect(calls).toEqual(['claimNow()']);
    }
  });

  it('offer + Erlauben → claimNow({ allowGrant: true }) once', async () => {
    const { d, calls } = deps('offer', 'grant');
    await expect(claimWithDeviceSessionOffer(d)).resolves.toBe(RESULT);
    expect(calls).toEqual(['ask', 'claimNow(allowGrant)']);
    expect(d.claimNow).toHaveBeenCalledWith({ allowGrant: true });
  });

  it('offer + Nicht jetzt → declineDeviceSession, then claimNow()', async () => {
    const { d, calls } = deps('offer', 'decline');
    await claimWithDeviceSessionOffer(d);
    expect(calls).toEqual(['ask', 'decline', 'claimNow()']);
  });

  it('offer dismissed → no claim (null)', async () => {
    const { d, calls } = deps('offer', 'dismiss');
    await expect(claimWithDeviceSessionOffer(d)).resolves.toBeNull();
    expect(calls).toEqual(['ask']);
  });

  it('a failing decline write still claims', async () => {
    const { d, calls } = deps('offer', 'decline');
    d.decline.mockRejectedValueOnce(new Error('storage'));
    await claimWithDeviceSessionOffer(d);
    expect(calls).toEqual(['ask', 'claimNow()']);
  });
});
