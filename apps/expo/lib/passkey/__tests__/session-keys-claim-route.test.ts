jest.mock('expo-secure-store', () => ({ WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY' }));
jest.mock('@/lib/storage/secureStorage', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
jest.mock('react-native-passkey', () => ({ Passkey: { create: jest.fn(), get: jest.fn(), isSupported: () => true } }));

jest.mock('../../supabase', () => ({ supabase: { from: jest.fn() } }));

import { getAddress, type Hex } from 'viem';
import { supabase } from '../../supabase';
import { fetchPasskeySessionKeysEnabled } from '../../supabase-app-settings';
import { chooseClaimPath, isDeviceSessionEligible, type ClaimPath } from '../session-keys/claim-route';
import { SESSION_RENEW_BEFORE_SEC, permissionIdsOf } from '../session-keys/builders';
import type { DeviceSessionState } from '../session-keys/grant';
import type { DeviceSessionRecord } from '../session-keys/device-key';
import type { PasskeySession } from '../session';

const SAFE = getAddress('0xe3d18fecdcf8e8b656b11340790f7c0147632deb');
const LEGACY = getAddress('0xc49de63ccfee46c6c5c3e393293f66779799fb28');
const SIGNER = getAddress('0xb0f0b8850a6b6cfff3da3dc739a4393fae95c641');
const NOW = 1_790_000_000;

function rec(validUntil: number): DeviceSessionRecord {
  return { v: 1, safe: SAFE, legacy: LEGACY, signer: SIGNER, validUntil, permissionIds: permissionIdsOf({ legacy: LEGACY, signer: SIGNER, validUntil }), status: 'active' };
}
function state(local: DeviceSessionRecord | null, onChain: 'mine' | 'none' = 'mine'): DeviceSessionState {
  const onChainPids: Hex[] = local && onChain === 'mine' ? [local.permissionIds.personalMint, local.permissionIds.groupMint] : [];
  return { layout: '7579', local, onChainPids, foreignPids: [], otherDeviceUntil: null };
}

const passkey: Pick<PasskeySession, 'safe' | 'identity' | 'ownerType' | 'credentialId'> = {
  safe: SAFE,
  identity: LEGACY,
  ownerType: 'passkey' as PasskeySession['ownerType'],
  credentialId: 'cred',
};

describe('isDeviceSessionEligible', () => {
  test.each([
    ['legacy passkey on iOS', passkey, 'ios', true],
    ['legacy passkey on Android', passkey, 'android', true],
    ['web never (secure store = localStorage)', passkey, 'web', false],
    ['12 words', { ...passkey, ownerType: 'ecdsa', credentialId: '' }, 'ios', false],
    ['Safe identity', { ...passkey, identity: SAFE }, 'ios', false],
    ['no session (thirdweb)', null, 'ios', false],
  ])('%s', (_n, s, os, want) => {
    expect(isDeviceSessionEligible(s as any, os as string)).toBe(want);
  });
});

describe('chooseClaimPath', () => {
  const base = { enabled: true, eligible: true, nowSec: NOW, declinedUntilSec: null as number | null };
  const cases: [string, Parameters<typeof chooseClaimPath>[0], ClaimPath][] = [
    ['kill switch off, even with an active record', { ...base, enabled: false, state: state(rec(NOW + 20 * 86_400)) }, 'passkey'],
    ['words owner (not eligible)', { ...base, eligible: false, state: state(null) }, 'passkey'],
    ['Safe identity (not eligible)', { ...base, eligible: false, state: state(rec(NOW + 20 * 86_400)) }, 'passkey'],
    ['state unreadable / not deployed', { ...base, state: null }, 'passkey'],
    ['active > 3 days', { ...base, state: state(rec(NOW + 20 * 86_400)) }, 'session'],
    ['active exactly 3 days', { ...base, state: state(rec(NOW + SESSION_RENEW_BEFORE_SEC)) }, 'session'],
    ['active < 3 days', { ...base, state: state(rec(NOW + SESSION_RENEW_BEFORE_SEC - 1)) }, 'renew-then-session'],
    ['expired', { ...base, state: state(rec(NOW - 10)) }, 'renew-then-session'],
    ['pids missing on chain', { ...base, state: state(rec(NOW + 20 * 86_400), 'none') }, 'offer'],
    ['pids missing on chain + declined', { ...base, declinedUntilSec: NOW + 60, state: state(rec(NOW + 20 * 86_400), 'none') }, 'passkey'],
    ['pending record (never counts as a session)', { ...base, state: state({ ...rec(NOW + 20 * 86_400), status: 'pending' }) }, 'offer'],
    ['declined', { ...base, declinedUntilSec: NOW + 60, state: state(null) }, 'passkey'],
    ['decline expired', { ...base, declinedUntilSec: NOW - 1, state: state(null) }, 'offer'],
    ['active session beats an old decline', { ...base, declinedUntilSec: NOW + 60, state: state(rec(NOW + 20 * 86_400)) }, 'session'],
    ['nothing', { ...base, state: state(null) }, 'offer'],
  ];
  test.each(cases)('%s', (_n, p, want) => {
    expect(chooseClaimPath(p)).toBe(want);
  });
});

describe('fetchPasskeySessionKeysEnabled (fails closed)', () => {
  function stub(result: { data: unknown; error: unknown } | 'throw') {
    (supabase.from as jest.Mock).mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (result === 'throw') throw new Error('offline');
            return result;
          },
        }),
      }),
    });
  }
  let errSpy: jest.SpyInstance;
  beforeEach(() => {
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => errSpy.mockRestore());

  test('"true" → on', async () => {
    stub({ data: { value: 'true' }, error: null });
    expect(await fetchPasskeySessionKeysEnabled()).toBe(true);
  });
  test('"false" → off', async () => {
    stub({ data: { value: 'false' }, error: null });
    expect(await fetchPasskeySessionKeysEnabled()).toBe(false);
  });
  test('missing → off', async () => {
    stub({ data: null, error: null });
    expect(await fetchPasskeySessionKeysEnabled()).toBe(false);
  });
  test('query error → off', async () => {
    stub({ data: null, error: { message: 'denied' } });
    expect(await fetchPasskeySessionKeysEnabled()).toBe(false);
  });
  test('thrown error → off', async () => {
    stub('throw');
    expect(await fetchPasskeySessionKeysEnabled()).toBe(false);
  });
});
