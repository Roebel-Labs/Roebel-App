/**
 * Manual Sentry initialization gated by user consent.
 *
 * Pre-consent strategy: errors are pushed into an in-memory ring buffer
 * (max 20 entries). When the user accepts the `crash` category, we call
 * Sentry.init() and replay the buffer. If the user denies, the buffer is
 * dropped and no data leaves the device.
 *
 * Replaces the previous `export default Sentry.wrap(Layout)` setup.
 */

import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

const BUFFER_MAX = 20;

type BufferedError = {
  error: unknown;
  ctx?: Record<string, unknown>;
  ts: number;
};

const buffer: BufferedError[] = [];
let initialized = false;

const dsn =
  (Constants.expoConfig?.extra as { sentryDsn?: string } | undefined)?.sentryDsn ||
  process.env.EXPO_PUBLIC_SENTRY_DSN ||
  '';

/**
 * Capture an error pre-consent. Stored locally only.
 * Safe to call from anywhere — never throws.
 */
export function bufferError(
  error: unknown,
  ctx?: Record<string, unknown>
): void {
  if (initialized) {
    try {
      Sentry.captureException(error, ctx ? { extra: ctx } : undefined);
    } catch {
      // ignore
    }
    return;
  }
  buffer.push({ error, ctx, ts: Date.now() });
  if (buffer.length > BUFFER_MAX) buffer.shift();
}

/**
 * Initialize Sentry and flush any buffered errors. Idempotent.
 * Call this only after the user consents to crash reporting.
 */
export function initSentryWithBufferReplay(): void {
  if (initialized) return;
  if (!dsn) {
    if (__DEV__) {
      console.warn('[sentry-init] no DSN configured; skipping init');
    }
    initialized = true;
    buffer.length = 0;
    return;
  }
  try {
    Sentry.init({
      dsn,
      // Skip session replay regardless of consent — out of scope for our v1.
      enableAutoSessionTracking: true,
      tracesSampleRate: 0,
      attachStacktrace: true,
      // Auto-attach IP, user-agent, and request headers. The user has explicitly
      // consented to crash reporting (this code only runs after that), and the
      // Datenschutzerklärung documents the SCC/DPF transfer to Sentry US.
      sendDefaultPii: true,
    });
    initialized = true;

    while (buffer.length > 0) {
      const entry = buffer.shift();
      if (!entry) break;
      try {
        Sentry.captureException(
          entry.error,
          entry.ctx ? { extra: entry.ctx } : undefined
        );
      } catch {
        // ignore individual replay failures
      }
    }
  } catch (err) {
    if (__DEV__) console.warn('[sentry-init] init failed:', err);
  }
}

/**
 * Disable Sentry on consent withdrawal. Drops the in-memory buffer too.
 */
export function closeSentry(): void {
  if (!initialized) {
    buffer.length = 0;
    return;
  }
  try {
    void Sentry.close();
  } catch {
    // ignore
  }
  initialized = false;
  buffer.length = 0;
}

/**
 * Identify-or-clear user against current consent state.
 * Replaces direct Sentry.setUser() calls scattered across contexts.
 */
export function setSentryUser(
  user: { id: string; segment?: string } | null
): void {
  if (!initialized) return;
  try {
    Sentry.setUser(user as { id: string } | null);
  } catch {
    // ignore
  }
}

export function isSentryInitialized(): boolean {
  return initialized;
}
