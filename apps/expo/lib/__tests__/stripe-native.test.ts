/**
 * The native Stripe SDK must only be required when its native module exists; otherwise
 * importing it crashes older app binaries (getEnforcing('StripeSdk') at module load).
 */
import { NativeModules, TurboModuleRegistry } from 'react-native';
import { isStripeNativeAvailable, loadStripeNative, __resetStripeNativeCache } from '../stripe-native';

jest.mock('@stripe/stripe-react-native', () => ({ loadConnectAndInitialize: jest.fn() }), { virtual: true });

describe('stripe-native', () => {
  const getSpy = jest.spyOn(TurboModuleRegistry, 'get');

  beforeEach(() => {
    __resetStripeNativeCache();
    getSpy.mockReset();
    delete (NativeModules as Record<string, unknown>).StripeSdk;
  });

  it('reports unavailable and loads nothing on a binary without the SDK', () => {
    getSpy.mockReturnValue(null);
    expect(isStripeNativeAvailable()).toBe(false);
    expect(loadStripeNative()).toBeNull();
  });

  it('loads the package when the native module is present', () => {
    getSpy.mockReturnValue({} as never);
    expect(isStripeNativeAvailable()).toBe(true);
    expect(loadStripeNative()).toMatchObject({ loadConnectAndInitialize: expect.any(Function) });
  });

  it('treats a throwing registry as unavailable', () => {
    getSpy.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(isStripeNativeAvailable()).toBe(false);
  });

  it('falls back when the bundle carries an empty stub instead of the package', () => {
    getSpy.mockReturnValue({} as never);
    jest.isolateModules(() => {
      jest.doMock('@stripe/stripe-react-native', () => ({}), { virtual: true });
      const fresh = require('../stripe-native');
      expect(fresh.loadStripeNative()).toBeNull();
    });
  });
});
