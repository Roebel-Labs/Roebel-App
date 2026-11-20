// Runtime guard for "Live dazuschalten" (phone guests via LiveKit).
//
// The LiveKit/WebRTC native modules ship only in the 3.9.0 store binaries. The same JS is also
// OTA-published to the older 3.7.0 runtime, where `@livekit/react-native` would throw at import time.
// So: NOTHING outside components/live/guest/* may import LiveKit, and that code is only ever loaded
// with a lazy require() after this check passed. This file itself must stay free of LiveKit imports.
import { NativeModules, Platform, TurboModuleRegistry } from 'react-native';

// Names the libraries themselves look up (see @livekit/react-native/src/LKNativeModule.ts and
// @livekit/react-native-webrtc/src/*.ts → `NativeModules.WebRTCModule`).
const REQUIRED_NATIVE_MODULES = ['LivekitReactNativeModule', 'WebRTCModule'] as const;

function hasNativeModule(name: string): boolean {
  try {
    if ((NativeModules as Record<string, unknown>)[name] != null) return true;
  } catch { /* fall through */ }
  try {
    return TurboModuleRegistry.get(name) != null;
  } catch {
    return false;
  }
}

let cached: boolean | null = null;

/** True when this binary contains the LiveKit + WebRTC native modules (3.9.0+ native builds). */
export function hasLiveKitNative(): boolean {
  if (cached !== null) return cached;
  cached = Platform.OS !== 'web' && REQUIRED_NATIVE_MODULES.every(hasNativeModule);
  return cached;
}
