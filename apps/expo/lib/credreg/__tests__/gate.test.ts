jest.mock('@/lib/supabase-app-settings', () => ({
  fetchCredentialsEnabled: jest.fn(async () => true),
  fetchCredentialsEnabledProduction: jest.fn(async () => true),
}));
jest.mock('@/constants/gnosis', () => ({ credentialRegistryGnosisAddress: '0x' + '11'.repeat(20), credentialRegistryDeployBlock: 0 }));
jest.mock('expo-updates', () => ({ channel: 'preview' }));

import { credentialsAllowed, credentialsConfigured, isCredentialsAllowed } from '../gate';

const mockSettings = jest.requireMock('@/lib/supabase-app-settings') as {
  fetchCredentialsEnabled: jest.Mock;
  fetchCredentialsEnabledProduction: jest.Mock;
};
const mockConstants = jest.requireMock('@/constants/gnosis') as { credentialRegistryGnosisAddress: string };

describe('credentialsAllowed', () => {
  it('kill switch off closes everything, also in dev', () => {
    expect(credentialsAllowed({ flag: false, productionFlag: true, channel: 'preview', dev: true })).toBe(false);
    expect(credentialsAllowed({ flag: false, productionFlag: true, channel: 'production', dev: false })).toBe(false);
  });

  it('dev and non-production channels are open with the flag on', () => {
    expect(credentialsAllowed({ flag: true, productionFlag: false, channel: null, dev: true })).toBe(true);
    expect(credentialsAllowed({ flag: true, productionFlag: false, channel: 'preview', dev: false })).toBe(true);
  });

  it('production needs the production flag too', () => {
    expect(credentialsAllowed({ flag: true, productionFlag: false, channel: 'production', dev: false })).toBe(false);
    expect(credentialsAllowed({ flag: true, productionFlag: true, channel: 'production', dev: false })).toBe(true);
  });

  it('a release build without a channel is closed', () => {
    expect(credentialsAllowed({ flag: true, productionFlag: true, channel: null, dev: false })).toBe(false);
    expect(credentialsAllowed({ flag: true, productionFlag: true, channel: undefined, dev: false })).toBe(false);
  });
});

describe('isCredentialsAllowed', () => {
  beforeEach(() => {
    mockSettings.fetchCredentialsEnabled.mockClear();
    mockSettings.fetchCredentialsEnabledProduction.mockClear();
  });

  it('is false without a registry address and makes no settings call', async () => {
    const saved = mockConstants.credentialRegistryGnosisAddress;
    mockConstants.credentialRegistryGnosisAddress = '';
    try {
      expect(credentialsConfigured()).toBe(false);
      expect(await isCredentialsAllowed()).toBe(false);
      expect(mockSettings.fetchCredentialsEnabled).not.toHaveBeenCalled();
      expect(mockSettings.fetchCredentialsEnabledProduction).not.toHaveBeenCalled();
    } finally {
      mockConstants.credentialRegistryGnosisAddress = saved;
    }
  });

  it('reads the flag on a configured preview build', async () => {
    expect(credentialsConfigured()).toBe(true);
    expect(await isCredentialsAllowed()).toBe(true);
    expect(mockSettings.fetchCredentialsEnabled).toHaveBeenCalledTimes(1);
    // Not on the production channel: the production flag is not read.
    expect(mockSettings.fetchCredentialsEnabledProduction).not.toHaveBeenCalled();
  });

  it('a failing settings read closes the gate', async () => {
    mockSettings.fetchCredentialsEnabled.mockRejectedValueOnce(new Error('offline'));
    expect(await isCredentialsAllowed()).toBe(false);
  });
});
