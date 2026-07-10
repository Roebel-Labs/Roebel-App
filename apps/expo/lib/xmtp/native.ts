/**
 * Lazy loader for the XMTP native module.
 *
 * @xmtp/react-native-sdk is an Expo NATIVE module — it only exists in builds
 * made after 2026-07-10. Every XMTP code path must obtain the SDK through
 * loadXmtp() instead of a static import so that a JS bundle running inside an
 * older native build degrades to the Supabase rail instead of crashing at
 * module-evaluation time.
 */

export type XmtpSdk = typeof import('@xmtp/react-native-sdk');

let cached: XmtpSdk | null = null;
let failed = false;

export async function loadXmtp(): Promise<XmtpSdk | null> {
  if (cached) return cached;
  if (failed) return null;
  try {
    cached = await import('@xmtp/react-native-sdk');
    return cached;
  } catch (err) {
    failed = true;
    console.warn('[xmtp] native module unavailable — DMs stay on the Supabase rail', err);
    return null;
  }
}

/** True once loadXmtp() has succeeded in this JS session. */
export function isXmtpLoaded(): boolean {
  return cached != null;
}
