jest.mock('@/lib/storage/secureStorage', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
jest.mock('expo-updates', () => ({ channel: 'production', runtimeVersion: '3.8.0' }));
jest.mock('@/lib/supabase-app-settings', () => ({ fetchPasskeyFlags: jest.fn(async () => ({})) }));

import { MIGRATION_STORE_KEY } from '../migration';
import { RECOVERY_STORE_KEY } from '../recovery-flow';
import { PASSKEY_SESSION_KEY } from '../session';
import {
  MIGRATION_RECORD_KEY,
  RECOVERY_STATE_KEY,
  hasExistingPasskeyAccount,
  isConnectedRecord,
  isRecoverySurfaceAllowed,
} from '../existing-account';

const reader = (m: Record<string, string>, failing: string[] = []) => ({
  getItem: async (k: string) => {
    if (failing.includes(k)) throw new Error('keychain locked');
    return m[k] ?? null;
  },
});
const DONE = JSON.stringify({ status: 'done', safe: '0x9999999999999999999999999999999999999999' });

describe('existing passkey account', () => {
  it('key names match the heavy modules', () => {
    expect(MIGRATION_RECORD_KEY).toBe(MIGRATION_STORE_KEY);
    expect(RECOVERY_STATE_KEY).toBe(RECOVERY_STORE_KEY);
  });
  it('isConnectedRecord: only a finished record', () => {
    expect(isConnectedRecord(DONE)).toBe(true);
    expect(isConnectedRecord(JSON.stringify({ status: 'passkeyCreated', safe: '0x1' }))).toBe(false);
    expect(isConnectedRecord('nope')).toBe(false);
    expect(isConnectedRecord(null)).toBe(false);
  });
  it('a passkey session or a connected record is an existing account', async () => {
    expect(await hasExistingPasskeyAccount('account', reader({ [PASSKEY_SESSION_KEY]: '{}' }))).toBe(true);
    expect(await hasExistingPasskeyAccount('account', reader({ [MIGRATION_RECORD_KEY]: DONE }))).toBe(true);
    expect(await hasExistingPasskeyAccount('account', reader({}))).toBe(false);
  });
  it('a recovery in progress counts only for the recovery screen scope', async () => {
    const r = reader({ [RECOVERY_STATE_KEY]: '{"step":"waitingDelay"}' });
    expect(await hasExistingPasskeyAccount('account', r)).toBe(false);
    expect(await hasExistingPasskeyAccount('account-or-recovery', r)).toBe(true);
    // A cleared state ('' via the removeItem fallback) is no recovery.
    expect(await hasExistingPasskeyAccount('account-or-recovery', reader({ [RECOVERY_STATE_KEY]: '' }))).toBe(false);
  });
  it('one failing read does not hide the other key', async () => {
    expect(await hasExistingPasskeyAccount('account', reader({ [MIGRATION_RECORD_KEY]: DONE }, [PASSKEY_SESSION_KEY]))).toBe(true);
    expect(await hasExistingPasskeyAccount('account', reader({}, [PASSKEY_SESSION_KEY, MIGRATION_RECORD_KEY]))).toBe(false);
  });
});

describe('isRecoverySurfaceAllowed', () => {
  it('an existing account is decided by the channel only (sign-up flag / kill switch off)', async () => {
    const surfaceAllowed = jest.fn(async () => false);
    await expect(
      isRecoverySurfaceAllowed('signup', 'account', { channelAllowed: () => true, hasExisting: async () => true, surfaceAllowed }),
    ).resolves.toBe(true);
    expect(surfaceAllowed).not.toHaveBeenCalled();
  });
  it('a closed channel is closed for everyone, without any storage read', async () => {
    const hasExisting = jest.fn(async () => true);
    await expect(isRecoverySurfaceAllowed('signup', 'account', { channelAllowed: () => false, hasExisting })).resolves.toBe(false);
    expect(hasExisting).not.toHaveBeenCalled();
  });
  it('no existing account: the ordinary surface gate', async () => {
    const deps = { channelAllowed: () => true, hasExisting: async () => false };
    await expect(isRecoverySurfaceAllowed('signup', 'account', { ...deps, surfaceAllowed: async () => false })).resolves.toBe(false);
    await expect(isRecoverySurfaceAllowed('signup', 'account', { ...deps, surfaceAllowed: async () => true })).resolves.toBe(true);
  });
  it('passes the scope through; a throwing existence check falls back to the surface gate', async () => {
    const hasExisting = jest.fn(async () => {
      throw new Error('x');
    });
    await expect(
      isRecoverySurfaceAllowed('signup', 'account-or-recovery', { channelAllowed: () => true, hasExisting, surfaceAllowed: async () => false }),
    ).resolves.toBe(false);
    expect(hasExisting).toHaveBeenCalledWith('account-or-recovery');
  });
  it('real defaults: production 3.8.0 + stored session + all flags off -> open', async () => {
    const store = jest.requireMock('@/lib/storage/secureStorage') as { getItemAsync: jest.Mock };
    store.getItemAsync.mockImplementation(async (k: string) => (k === PASSKEY_SESSION_KEY ? '{}' : null));
    await expect(isRecoverySurfaceAllowed()).resolves.toBe(true);
    store.getItemAsync.mockImplementation(async () => null);
    await expect(isRecoverySurfaceAllowed()).resolves.toBe(false);
  });
});
