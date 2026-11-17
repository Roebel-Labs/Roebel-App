/**
 * Cold-start login restore that never mistakes "could not restore right now" for "logged out".
 *
 * Restoring a thirdweb session needs the stored auth token AND a live call to thirdweb. Before this
 * module any error on that call was swallowed and the app showed the logged-out state, although the
 * token was still on the device (seen after store updates on iOS and Android: logged out on the
 * first start, logged in again after a restart).
 *
 * Rules:
 *  - no stored session            → genuine logout, no retry;
 *  - stored session, attempt fails → retry; if every attempt fails the outcome is "failed", which
 *    callers must NOT treat as a logout (keep cached state, keep retrying in the background).
 *
 * Pure: no React, no storage or network imports. Every outcome is written to a small on-device log
 * so the reason for a failed restore can be read afterwards instead of guessed.
 */

export type RestoreOutcome = 'restored' | 'no-session' | 'failed' | 'cancelled';

export type RestoreResult = {
  outcome: RestoreOutcome;
  attempts: number;
  /** One message per failed attempt, in order. */
  errors: string[];
  hadStoredSession: boolean;
};

export type RestoreDeps = {
  /** true = a wallet is connected; false = nothing connected; throws = the restore itself failed. */
  attempt: () => Promise<boolean>;
  /** Whether the device holds a login token. A throw counts as "yes" (never log out on a storage error). */
  hasStoredSession: () => Promise<boolean>;
  /** Waits between attempts; `delaysMs.length` is the number of retries. */
  delaysMs: readonly number[];
  sleep: (ms: number) => Promise<void>;
  isCancelled?: () => boolean;
};

/** First-boot retries: about 12 s in total, short enough to stay inside the "reconnecting" state. */
export const RESTORE_RETRY_DELAYS_MS: readonly number[] = [1000, 3000, 8000];
/** Background retry interval after a failed boot restore. */
export const RESTORE_BACKGROUND_INTERVAL_MS = 20_000;
/** The background timer stops after this many tries (~5 min); returning to the app still retries. */
export const RESTORE_BACKGROUND_MAX_TICKS = 15;

function errorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  return raw.slice(0, 300);
}

export async function restoreWithRetry(deps: RestoreDeps): Promise<RestoreResult> {
  const errors: string[] = [];
  let attempts = 0;
  let stored: boolean | null = null;

  for (let i = 0; i <= deps.delaysMs.length; i++) {
    if (deps.isCancelled?.()) return { outcome: 'cancelled', attempts, errors, hadStoredSession: stored ?? false };
    attempts += 1;
    try {
      if (await deps.attempt()) return { outcome: 'restored', attempts, errors, hadStoredSession: true };
      errors.push('no account restored');
    } catch (e) {
      errors.push(errorMessage(e));
    }
    if (deps.isCancelled?.()) return { outcome: 'cancelled', attempts, errors, hadStoredSession: stored ?? false };

    if (stored === null) {
      try {
        stored = await deps.hasStoredSession();
      } catch {
        stored = true;
      }
      if (!stored) return { outcome: 'no-session', attempts, errors, hadStoredSession: false };
    }
    if (i < deps.delaysMs.length) await deps.sleep(deps.delaysMs[i]);
  }
  return { outcome: 'failed', attempts, errors, hadStoredSession: true };
}

// --- on-device log ---------------------------------------------------------------------------

export const RESTORE_REPORTS_KEY = 'wallet.restore.reports.v1';
export const RESTORE_REPORTS_MAX = 10;

export type RestoreReport = Omit<RestoreResult, 'outcome'> & {
  outcome: RestoreOutcome | 'restored-late';
  at: string;
  appVersion?: string;
  platform?: string;
  /** expo-updates: id of the running update and whether the embedded (store) bundle is running. */
  updateId?: string | null;
  embeddedLaunch?: boolean;
};

type ReportStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

export async function readRestoreReports(storage: Pick<ReportStorage, 'getItem'>): Promise<RestoreReport[]> {
  try {
    const raw = await storage.getItem(RESTORE_REPORTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as RestoreReport[]) : [];
  } catch {
    return [];
  }
}

/** Appends a report, keeping the newest RESTORE_REPORTS_MAX. Never throws. */
export async function appendRestoreReport(storage: ReportStorage, report: RestoreReport): Promise<void> {
  try {
    const next = [...(await readRestoreReports(storage)), report].slice(-RESTORE_REPORTS_MAX);
    await storage.setItem(RESTORE_REPORTS_KEY, JSON.stringify(next));
  } catch {
    // Diagnostics must never affect the restore.
  }
}
