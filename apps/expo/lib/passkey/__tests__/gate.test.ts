import { passkeySurfaceAllowed, runtimeSupportsPasskeys } from '../gate';

const mockUpdates: { channel: string | null; runtimeVersion: string | null } = { channel: 'production', runtimeVersion: '3.7.0' };
jest.mock('expo-updates', () => ({
  get channel() {
    return mockUpdates.channel;
  },
  get runtimeVersion() {
    return mockUpdates.runtimeVersion;
  },
}));
jest.mock('@/lib/supabase-app-settings', () => ({
  fetchPasskeyFlags: jest.fn(async () => ({ passkey_accounts_enabled: true })),
}));

describe('runtimeSupportsPasskeys', () => {
  it('needs runtime ≥ 3.8.0', () => {
    expect(runtimeSupportsPasskeys('3.7.0')).toBe(false);
    expect(runtimeSupportsPasskeys('3.7.99')).toBe(false);
    expect(runtimeSupportsPasskeys('2.9.9')).toBe(false);
    expect(runtimeSupportsPasskeys('3.8.0')).toBe(true);
    expect(runtimeSupportsPasskeys('3.9.0')).toBe(true);
    expect(runtimeSupportsPasskeys('3.10.0')).toBe(true);
    expect(runtimeSupportsPasskeys('4.0.0')).toBe(true);
  });
  it('is false for missing or unparsable versions', () => {
    expect(runtimeSupportsPasskeys(null)).toBe(false);
    expect(runtimeSupportsPasskeys(undefined)).toBe(false);
    expect(runtimeSupportsPasskeys('')).toBe(false);
    expect(runtimeSupportsPasskeys('abc')).toBe(false);
    expect(runtimeSupportsPasskeys('3.8')).toBe(false);
  });
});

describe('passkeySurfaceAllowed', () => {
  const base = { flag: true, dev: false, runtimeVersion: '3.8.0' } as const;
  it('kill switch off closes every surface on every channel', () => {
    for (const surface of ['signup', 'migration', 'detach', 'words'] as const) {
      expect(passkeySurfaceAllowed({ ...base, flag: false, surface, channel: 'preview' })).toBe(false);
      expect(passkeySurfaceAllowed({ ...base, flag: false, surface, channel: null, dev: true })).toBe(false);
    }
  });
  it('preview and dev open every surface with the kill switch on', () => {
    for (const surface of ['signup', 'migration', 'detach', 'words'] as const) {
      expect(passkeySurfaceAllowed({ ...base, surface, channel: 'preview' })).toBe(true);
      expect(passkeySurfaceAllowed({ ...base, surface, channel: null, dev: true })).toBe(true);
    }
  });
  it('production: signup opens alone; the others need signup AND their own flag', () => {
    const p = { ...base, channel: 'production' };
    expect(passkeySurfaceAllowed({ ...p, surface: 'signup', productionFlags: { signup: true } })).toBe(true);
    expect(passkeySurfaceAllowed({ ...p, surface: 'migration', productionFlags: { signup: true } })).toBe(false);
    expect(passkeySurfaceAllowed({ ...p, surface: 'detach', productionFlags: { signup: true, migration: true } })).toBe(false);
    expect(passkeySurfaceAllowed({ ...p, surface: 'words', productionFlags: { words: true } })).toBe(false);
    expect(passkeySurfaceAllowed({ ...p, surface: 'words', productionFlags: { signup: true, words: true } })).toBe(true);
  });
  it('production below runtime 3.8.0 and a release build without a channel stay closed', () => {
    expect(passkeySurfaceAllowed({ ...base, surface: 'signup', channel: 'production', runtimeVersion: '3.7.0', productionFlags: { signup: true } })).toBe(false);
    expect(passkeySurfaceAllowed({ ...base, surface: 'signup', channel: null })).toBe(false);
  });
});

describe('isPasskeySurfaceAllowed', () => {
  const g = globalThis as { __DEV__?: boolean };
  const prevDev = g.__DEV__;
  const settings = jest.requireMock('@/lib/supabase-app-settings') as { fetchPasskeyFlags: jest.Mock };
  const { isPasskeySurfaceAllowed, passkeySurfacesAllowed } = jest.requireActual('../gate') as typeof import('../gate');
  beforeEach(() => {
    g.__DEV__ = false;
    settings.fetchPasskeyFlags.mockReset().mockResolvedValue({ passkey_accounts_enabled: true });
  });
  afterAll(() => {
    g.__DEV__ = prevDev;
  });

  it('production on the 3.7.0 binary resolves false without reading any flag', async () => {
    mockUpdates.channel = 'production';
    mockUpdates.runtimeVersion = '3.7.0';
    await expect(isPasskeySurfaceAllowed('signup')).resolves.toBe(false);
    expect(settings.fetchPasskeyFlags).not.toHaveBeenCalled();
  });
  it('production on 3.8.0 opens signup with the signup flag, detach needs its own', async () => {
    mockUpdates.channel = 'production';
    mockUpdates.runtimeVersion = '3.8.0';
    settings.fetchPasskeyFlags.mockResolvedValue({ passkey_accounts_enabled: true, passkey_accounts_enabled_production: true });
    await expect(isPasskeySurfaceAllowed('signup')).resolves.toBe(true);
    await expect(isPasskeySurfaceAllowed('detach')).resolves.toBe(false);
  });
  it('a failed flag read closes the gate', async () => {
    mockUpdates.channel = 'production';
    mockUpdates.runtimeVersion = '3.8.0';
    settings.fetchPasskeyFlags.mockRejectedValue(new Error('offline'));
    await expect(isPasskeySurfaceAllowed('signup')).resolves.toBe(false);
  });
  it('preview opens every surface with the kill switch on', async () => {
    mockUpdates.channel = 'preview';
    mockUpdates.runtimeVersion = '3.7.0';
    await expect(isPasskeySurfaceAllowed('words')).resolves.toBe(true);
  });
  it('a release build without a channel resolves false without reading any flag', async () => {
    mockUpdates.channel = null;
    mockUpdates.runtimeVersion = '3.8.0';
    await expect(isPasskeySurfaceAllowed('signup')).resolves.toBe(false);
    expect(settings.fetchPasskeyFlags).not.toHaveBeenCalled();
  });
  it('passkeySurfacesAllowed answers several surfaces from ONE flag fetch', async () => {
    mockUpdates.channel = 'production';
    mockUpdates.runtimeVersion = '3.8.0';
    settings.fetchPasskeyFlags.mockResolvedValue({
      passkey_accounts_enabled: true,
      passkey_accounts_enabled_production: true,
      passkey_migration_enabled_production: true,
    });
    await expect(passkeySurfacesAllowed(['signup', 'migration', 'detach'])).resolves.toEqual({ signup: true, migration: true, detach: false });
    expect(settings.fetchPasskeyFlags).toHaveBeenCalledTimes(1);
    settings.fetchPasskeyFlags.mockRejectedValue(new Error('offline'));
    await expect(passkeySurfacesAllowed(['signup', 'detach'])).resolves.toEqual({ signup: false, detach: false });
  });
});
