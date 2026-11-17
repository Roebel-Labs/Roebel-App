/**
 * "The 12 words on this phone can no longer be read" — a tiny module-level event (preflight E2).
 *
 * The session signer announces it when a words session tries to sign and the protected phrase is
 * gone (the system invalidated it after a fingerprint / Face ID change, or it was removed). The
 * person stays signed in (the session holds no secret); a root watcher listens and routes once to
 * "enter your 12 words again" (`/settings/my-words?reenter=1`).
 *
 * Import-free on purpose: the root layout can listen without pulling in key derivation.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

/** Subscribes; returns the unsubscribe. */
export function onPhraseUnavailable(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Notifies every listener; a throwing listener never breaks the signer's own error. */
export function emitPhraseUnavailable(): void {
  for (const l of [...listeners]) {
    try {
      l();
    } catch {
      // ignore
    }
  }
}

/** The screen that asks for the words again. */
export const PHRASE_REENTRY_ROUTE = '/settings/my-words?reenter=1';

/** Repeated failures in one burst (several signatures at once) open the re-entry screen only once. */
export const REENTRY_COOLDOWN_MS = 5_000;

/**
 * Listens for "phrase unavailable" and opens the re-entry screen ONCE per burst. Returns the
 * unsubscribe. Used by the root watcher (components/passkey/PhraseReentryWatch.tsx).
 */
export function routeOnPhraseUnavailable(open: (route: string) => void, now: () => number = Date.now): () => void {
  let last = -Infinity;
  return onPhraseUnavailable(() => {
    const t = now();
    if (t - last < REENTRY_COOLDOWN_MS) return;
    last = t;
    open(PHRASE_REENTRY_ROUTE);
  });
}
