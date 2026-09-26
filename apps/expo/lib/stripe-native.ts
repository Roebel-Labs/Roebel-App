// Runtime detection for the native Stripe SDK (@stripe/stripe-react-native).
//
// Importing the package calls TurboModuleRegistry.getEnforcing('StripeSdk') at module load, which
// crashes on app binaries built before the SDK was added. Everything that needs the SDK therefore
// goes through loadStripeNative(): it only requires the package when the native module is present,
// so the same JS bundle runs on old binaries (hosted-browser fallback) and new ones (in-app flow).
import { NativeModules, TurboModuleRegistry } from 'react-native';

export function isStripeNativeAvailable(): boolean {
  try {
    return TurboModuleRegistry.get('StripeSdk') != null || NativeModules.StripeSdk != null;
  } catch {
    return false;
  }
}

type StripeNative = typeof import('@stripe/stripe-react-native');

let cached: StripeNative | null | undefined;

export function loadStripeNative(): StripeNative | null {
  if (cached !== undefined) return cached;
  if (!isStripeNativeAvailable()) {
    cached = null;
    return cached;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@stripe/stripe-react-native') as Partial<StripeNative>;
    // metro.config.js resolves the package to an empty module when an OTA was exported from a
    // checkout without it installed; treat that like "no SDK" so callers use the hosted fallback.
    cached = typeof mod?.loadConnectAndInitialize === 'function' ? (mod as StripeNative) : null;
  } catch (err) {
    console.warn('[stripe-native] native module present but package failed to load', err);
    cached = null;
  }
  return cached;
}

/** Test hook: forget the cached module so availability is re-evaluated. */
export function __resetStripeNativeCache(): void {
  cached = undefined;
}
