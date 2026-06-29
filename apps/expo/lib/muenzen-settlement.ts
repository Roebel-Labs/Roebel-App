export interface RetryOptions {
  /** Total attempts including the first. Default 3. */
  attempts?: number;
  /** Backoff (ms) before each retry, indexed from the first retry. Default [3000, 9000]. */
  backoffMs?: number[];
  /** Injectable sleeper so tests stay deterministic. Default real setTimeout. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Run `settle` with retries + backoff. Resolves the moment it succeeds; throws
 * the last error after all attempts are exhausted. Pure — no React, no globals
 * beyond the injectable sleeper — so it unit-tests cleanly.
 */
export async function runWithRetry(
  settle: () => Promise<void>,
  { attempts = 3, backoffMs = [3000, 9000], sleep = defaultSleep }: RetryOptions = {},
): Promise<void> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      await settle();
      return;
    } catch (err) {
      lastErr = err;
      const isLast = i >= attempts - 1;
      if (!isLast) {
        const wait = backoffMs[i] ?? backoffMs[backoffMs.length - 1] ?? 0;
        if (wait > 0) await sleep(wait);
      }
    }
  }
  throw lastErr;
}
