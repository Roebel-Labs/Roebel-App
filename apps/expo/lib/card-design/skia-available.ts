// Whether this binary contains React Native Skia. Skia came with the 3.10.0 card designer as a
// native dependency; an older binary that receives the OTA must never import it
// (@shopify/react-native-skia looks up its native module with getEnforcing and throws).
// Every Skia import in the app goes behind this check (lazy require), so such a binary keeps the
// pictures it showed before.
import { TurboModuleRegistry } from 'react-native';

let cached: boolean | null = null;

export function skiaAvailable(): boolean {
  if (cached === null) {
    try {
      cached = TurboModuleRegistry.get('RNSkiaModule') != null;
    } catch {
      cached = false;
    }
  }
  return cached;
}

/** Tests: force the answer (null = detect again). */
export function setSkiaAvailableForTests(v: boolean | null): void {
  cached = v;
}
