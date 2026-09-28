import { passkeyPreviewAllowed, runtimeSupportsPasskeys } from '../gate';

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
  fetchPasskeyAccountsEnabled: jest.fn(async () => true),
  fetchPasskeyAccountsEnabledProduction: jest.fn(async () => false),
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

describe('passkeyPreviewAllowed', () => {
  it('is closed on the production channel even with the flag on (no production flag)', () => {
    expect(passkeyPreviewAllowed({ flag: true, channel: 'production', dev: false })).toBe(false);
    expect(passkeyPreviewAllowed({ flag: true, channel: 'production', dev: false, runtimeVersion: '3.8.0' })).toBe(false);
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
    expect(passkeyPreviewAllowed({ flag: true, channel: null, dev: false, productionFlag: true, runtimeVersion: '3.8.0' })).toBe(false);
  });

  // Every combination on the production channel (release build).
  const cases: Array<[boolean, boolean, string | null, boolean]> = [
    // flag, productionFlag, runtimeVersion, expected
    [false, false, '3.7.0', false],
    [false, false, '3.8.0', false],
    [false, true, '3.7.0', false],
    [false, true, '3.8.0', false], // the main flag stays the global kill switch
    [true, false, '3.7.0', false],
    [true, false, '3.8.0', false],
    [true, true, '3.7.0', false], // the 3.7.0 binary lacks webcredentials:id.ortis.app
    [true, true, null, false],
    [true, true, '3.8.0', true],
    [true, true, '3.9.2', true],
  ];
  it.each(cases)('production: flag=%s productionFlag=%s runtime=%s → %s', (flag, productionFlag, runtimeVersion, expected) => {
    expect(passkeyPreviewAllowed({ flag, productionFlag, runtimeVersion, channel: 'production', dev: false })).toBe(expected);
  });

  it('the production flag has no effect on preview', () => {
    expect(passkeyPreviewAllowed({ flag: true, productionFlag: false, runtimeVersion: '3.7.0', channel: 'preview', dev: false })).toBe(true);
    expect(passkeyPreviewAllowed({ flag: false, productionFlag: true, runtimeVersion: '3.8.0', channel: 'preview', dev: false })).toBe(false);
  });
});

describe('isPasskeyPreviewAllowed', () => {
  const g = globalThis as { __DEV__?: boolean };
  const prevDev = g.__DEV__;
  const settings = jest.requireMock('@/lib/supabase-app-settings') as {
    fetchPasskeyAccountsEnabled: jest.Mock;
    fetchPasskeyAccountsEnabledProduction: jest.Mock;
  };
  const { isPasskeyPreviewAllowed } = jest.requireActual('../gate') as typeof import('../gate');
  beforeEach(() => {
    g.__DEV__ = false;
    settings.fetchPasskeyAccountsEnabled.mockReset().mockResolvedValue(true);
    settings.fetchPasskeyAccountsEnabledProduction.mockReset().mockResolvedValue(false);
  });
  afterAll(() => {
    g.__DEV__ = prevDev;
  });

  it('production on the 3.7.0 binary returns false without reading any flag', async () => {
    mockUpdates.channel = 'production';
    mockUpdates.runtimeVersion = '3.7.0';
    settings.fetchPasskeyAccountsEnabledProduction.mockResolvedValue(true);
    await expect(isPasskeyPreviewAllowed()).resolves.toBe(false);
    expect(settings.fetchPasskeyAccountsEnabled).not.toHaveBeenCalled();
    expect(settings.fetchPasskeyAccountsEnabledProduction).not.toHaveBeenCalled();
  });
  it('production on 3.8.0 stays closed while the production flag is missing', async () => {
    mockUpdates.channel = 'production';
    mockUpdates.runtimeVersion = '3.8.0';
    await expect(isPasskeyPreviewAllowed()).resolves.toBe(false);
    expect(settings.fetchPasskeyAccountsEnabledProduction).toHaveBeenCalled();
  });
  it('production on 3.8.0 opens with both flags', async () => {
    mockUpdates.channel = 'production';
    mockUpdates.runtimeVersion = '3.8.0';
    settings.fetchPasskeyAccountsEnabledProduction.mockResolvedValue(true);
    await expect(isPasskeyPreviewAllowed()).resolves.toBe(true);
  });
  it('production on 3.8.0 stays closed when the main flag is off', async () => {
    mockUpdates.channel = 'production';
    mockUpdates.runtimeVersion = '3.8.0';
    settings.fetchPasskeyAccountsEnabled.mockResolvedValue(false);
    settings.fetchPasskeyAccountsEnabledProduction.mockResolvedValue(true);
    await expect(isPasskeyPreviewAllowed()).resolves.toBe(false);
  });
  it('a failed flag read closes the gate', async () => {
    mockUpdates.channel = 'production';
    mockUpdates.runtimeVersion = '3.8.0';
    settings.fetchPasskeyAccountsEnabledProduction.mockRejectedValue(new Error('offline'));
    await expect(isPasskeyPreviewAllowed()).resolves.toBe(false);
  });
  it('preview ignores the production flag', async () => {
    mockUpdates.channel = 'preview';
    mockUpdates.runtimeVersion = '3.7.0';
    await expect(isPasskeyPreviewAllowed()).resolves.toBe(true);
    expect(settings.fetchPasskeyAccountsEnabledProduction).not.toHaveBeenCalled();
  });
  it('a release build without a channel returns false without reading any flag', async () => {
    mockUpdates.channel = null;
    mockUpdates.runtimeVersion = '3.8.0';
    await expect(isPasskeyPreviewAllowed()).resolves.toBe(false);
    expect(settings.fetchPasskeyAccountsEnabled).not.toHaveBeenCalled();
  });
});
