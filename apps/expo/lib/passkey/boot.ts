/**
 * Cold-start wallet restore order (WalletBootContext):
 *
 *   1. passkey channel allowed (sync, no network): the first session source whose stored session
 *      exists owns the boot and is restored with retries (same rules as the thirdweb restore).
 *   2. a restore that keeps failing is a FAILURE, not a logout: thirdweb is NOT tried, so a dormant
 *      thirdweb login can never come up as a different account.
 *   3. only a corrupt session (retrying cannot help) or no stored session falls through to the
 *      existing thirdweb path.
 *
 * On the production channel step 1 returns before reading any storage, so production boots
 * exactly as before. This module never reads, writes or deletes a thirdweb key.
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

const isCorrupt = (e: unknown) => e instanceof SessionCorruptError;

function restoreSource(
  source: SessionSource,
  deps: Pick<BootDeps, 'sleep' | 'isCancelled'>,
  delaysMs: readonly number[],
): Promise<RestoreResult> {
  return restoreWithRetry({
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
    isFatal: isCorrupt,
  });
}

/** One attempt, for the background timer after a failed boot restore. */
export function retrySource(source: SessionSource, deps: Pick<BootDeps, 'sleep' | 'isCancelled'>): Promise<RestoreResult> {
  return restoreSource(source, deps, []);
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
      const result = await restoreSource(source, deps, deps.delaysMs);
      if (result.outcome === 'restored' || result.outcome === 'cancelled') return { owner: source.owner, result };
      const corrupt = result.errors.length > 0 && result.errors.every((m) => m === new SessionCorruptError().message);
      if (result.outcome === 'failed' && corrupt) break; // unreadable session: thirdweb path
      return { owner: source.owner, result };
    }
  }
  if (deps.isCancelled?.()) return { owner: 'thirdweb', result: { outcome: 'cancelled', attempts: 0, errors: [], hadStoredSession: false } };
  return { owner: 'thirdweb', result: await deps.restoreThirdweb() };
}
