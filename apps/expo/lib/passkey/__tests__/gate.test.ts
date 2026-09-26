import { passkeyPreviewAllowed } from '../gate';

jest.mock('expo-updates', () => ({ channel: 'production' }));
jest.mock('@/lib/supabase-app-settings', () => ({ fetchPasskeyAccountsEnabled: jest.fn(async () => true) }));

describe('passkeyPreviewAllowed', () => {
  it('is closed on the production channel even with the flag on', () => {
    expect(passkeyPreviewAllowed({ flag: true, channel: 'production', dev: false })).toBe(false);
  });
  it('is closed without the flag on any channel', () => {
    expect(passkeyPreviewAllowed({ flag: false, channel: 'preview', dev: false })).toBe(false);
    expect(passkeyPreviewAllowed({ flag: false, channel: null, dev: true })).toBe(false);
  });
  it('opens on preview with the flag', () => {
    expect(passkeyPreviewAllowed({ flag: true, channel: 'preview', dev: false })).toBe(true);
  });
  it('a release build without a channel stays closed; dev builds are allowed', () => {
    expect(passkeyPreviewAllowed({ flag: true, channel: null, dev: false })).toBe(false);
    expect(passkeyPreviewAllowed({ flag: true, channel: null, dev: true })).toBe(true);
  });
});

describe('isPasskeyPreviewAllowed on the production channel', () => {
  const g = globalThis as { __DEV__?: boolean };
  const prevDev = g.__DEV__;
  afterEach(() => {
    g.__DEV__ = prevDev;
  });
  it('returns false without reading the flag', async () => {
    g.__DEV__ = false;
    const settings = jest.requireMock('@/lib/supabase-app-settings') as { fetchPasskeyAccountsEnabled: jest.Mock };
    const { isPasskeyPreviewAllowed } = jest.requireActual('../gate') as typeof import('../gate');
    await expect(isPasskeyPreviewAllowed()).resolves.toBe(false);
    expect(settings.fetchPasskeyAccountsEnabled).not.toHaveBeenCalled();
  });
});
