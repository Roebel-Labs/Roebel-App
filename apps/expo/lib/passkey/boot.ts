/**
 * Cold-start wallet restore order (WalletBootContext):
 *
 *   1. passkey channel allowed (sync, no network): the first session source whose stored session
 *      exists owns the boot and is restored with retries (same rules as the thirdweb restore).
 *   2. a restore that keeps failing is a FAILURE, not a logout: thirdweb is NOT tried, so a dormant
 *      thirdweb login can never come up as a different account.
 *   3. only a corrupt session (retrying cannot help) or no stored session falls through to the
 *      existing thirdweb path. The background retry after a failed boot does the same: a source
 *      whose session turns out corrupt or gone is dropped and thirdweb is restored
 *      (backgroundRestore).
 *
 * The passkey source's `hasStored` is a direct SecureStore read (boot-source.ts), outside the lazy
 * import of the sign-in runtime: a failing import cannot touch someone without a passkey session.
 *
 * A channel that is not allowed (a production binary < 3.8.0) skips step 1 before reading any
 * storage, so it boots exactly as before. This module never reads, writes or deletes a thirdweb key.
 */
import { restoreWithRetry, type RestoreResult } from '../wallet-restore';

export class SessionCorruptError extends Error {
  constructor(message = 'stored session is unreadable') {
    super(message);
    this.name = 'SessionCorruptError';
  }
}

export type SessionSource<S = unknown> = {
  owner: 'passkey' | 'words';
  /** Raw presence of the session key. */
  hasStored: () => Promise<boolean>;
  /** null when the key is present but unparsable; may throw on a storage error. */
  load: () => Promise<S | null>;
  connect: (session: S) => Promise<void>;
};

export type BootDeps = {
  channelAllowed: () => boolean;
  sources: SessionSource[];
  restoreThirdweb: () => Promise<RestoreResult>;
  delaysMs: readonly number[];
  sleep: (ms: number) => Promise<void>;
  isCancelled?: () => boolean;
};

export type BootResult = { owner: 'passkey' | 'words' | 'thirdweb'; result: RestoreResult };

/**
 * Wraps a lazily loaded source. `hasStored` is a direct, light storage read that never touches the
 * loader: a failing import must only ever affect people who really hold a session (for them it
 * surfaces inside the boot as a storage-style error, retry -> failed, never a logout). Everyone
 * else (no session key) goes straight to the thirdweb path.
 */
export function lazySessionSource<S>(
  owner: SessionSource['owner'],
  hasStored: () => Promise<boolean>,
  loader: () => Promise<SessionSource<S>>,
): SessionSource<S> {
  return {
    owner,
    hasStored,
    load: async () => (await loader()).load(),
    connect: async (session) => (await loader()).connect(session),
  };
}

async function restoreSource(
  source: SessionSource,
  deps: Pick<BootDeps, 'sleep' | 'isCancelled'>,
  delaysMs: readonly number[],
): Promise<{ result: RestoreResult; corrupt: boolean }> {
  let corrupt = false;
  const result = await restoreWithRetry({
    attempt: async () => {
      const session = await source.load();
      if (session === null) throw new SessionCorruptError();
      await source.connect(session);
      return true;
    },
    hasStoredSession: async () => true,
    delaysMs,
    sleep: deps.sleep,
    isCancelled: deps.isCancelled,
    isFatal: (e) => (e instanceof SessionCorruptError ? (corrupt = true) : false),
  });
  return { result, corrupt };
}

export type BackgroundRestore = BootResult & {
  /** The source the NEXT background attempt must retry; null = the thirdweb path. */
  failedSource: SessionSource | null;
};

/**
 * One background attempt after a failed boot. With a failed sovereign source: one attempt at that
 * source; when it turns out corrupt or gone (the session key was removed or became unreadable,
 * retrying cannot help) the source is dropped and the thirdweb restore runs in the same tick, so
 * the timer never keeps retrying a session that no longer exists. Without one: the thirdweb restore.
 */
export async function backgroundRestore(p: {
  failedSource: SessionSource | null;
  restoreThirdweb: () => Promise<RestoreResult>;
  sleep: (ms: number) => Promise<void>;
  isCancelled?: () => boolean;
}): Promise<BackgroundRestore> {
  const source = p.failedSource;
  if (source) {
    const { result, corrupt } = await restoreSource(source, p, []);
    if (result.outcome !== 'failed' || !corrupt) return { owner: source.owner, result, failedSource: source };
    if (p.isCancelled?.()) {
      return { owner: 'thirdweb', result: { outcome: 'cancelled', attempts: 0, errors: [], hadStoredSession: false }, failedSource: null };
    }
  }
  return { owner: 'thirdweb', result: await p.restoreThirdweb(), failedSource: null };
}

export async function bootWallets(deps: BootDeps): Promise<BootResult> {
  if (deps.channelAllowed()) {
    for (const source of deps.sources) {
      let stored: boolean;
      try {
        stored = await source.hasStored();
      } catch {
        stored = true; // never treat a storage error as "no session"
      }
      if (deps.isCancelled?.()) return { owner: source.owner, result: { outcome: 'cancelled', attempts: 0, errors: [], hadStoredSession: true } };
      if (!stored) continue;
      const { result, corrupt } = await restoreSource(source, deps, deps.delaysMs);
      if (result.outcome === 'restored' || result.outcome === 'cancelled') return { owner: source.owner, result };
      if (result.outcome === 'failed' && corrupt) break; // unreadable session: thirdweb path
      return { owner: source.owner, result };
    }
  }
  if (deps.isCancelled?.()) return { owner: 'thirdweb', result: { outcome: 'cancelled', attempts: 0, errors: [], hadStoredSession: false } };
  return { owner: 'thirdweb', result: await deps.restoreThirdweb() };
}
