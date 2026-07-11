/**
 * Regression test for the 2026-07-11 crash-loop incident.
 *
 * On builds WITHOUT the XMTP native module, `await import('@xmtp/react-native-sdk')`
 * cannot be guarded by try/catch: Metro evaluates dynamic imports inside
 * guardedLoadModule, which routes a module-factory throw to
 * ErrorUtils.reportFatalError — a hard release crash ("Röbel keeps stopping"),
 * because the SDK's factory calls requireNativeModule('XMTP') at evaluation
 * time. The only safe pattern is to probe requireOptionalNativeModule('XMTP')
 * first and NEVER evaluate the SDK bundle when the native module is absent.
 *
 * Jest cannot simulate Metro's fatal-report path, so this test pins the
 * observable contract instead: the probe is consulted, and the SDK module
 * factory never runs when the probe returns null.
 */

let mockSdkEvaluated = false;

jest.mock('expo-modules-core', () => ({
  requireOptionalNativeModule: jest.fn(() => null), // old build: module absent
}));

jest.mock('@xmtp/react-native-sdk', () => {
  // Evaluating this factory at all IS the crash on an old build.
  mockSdkEvaluated = true;
  return {};
});

describe('loadXmtp on a build without the XMTP native module', () => {
  it('probes the native module and never evaluates the SDK bundle', async () => {
    const { requireOptionalNativeModule } = require('expo-modules-core');
    const { loadXmtp, isXmtpLoaded } = require('../native');

    await expect(loadXmtp()).resolves.toBeNull();

    expect(requireOptionalNativeModule).toHaveBeenCalledWith('XMTP');
    expect(mockSdkEvaluated).toBe(false);
    expect(isXmtpLoaded()).toBe(false);

    // Second call short-circuits on the failed flag — still no evaluation.
    await expect(loadXmtp()).resolves.toBeNull();
    expect(mockSdkEvaluated).toBe(false);
  });
});
