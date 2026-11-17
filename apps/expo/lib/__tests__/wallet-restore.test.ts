import { appendRestoreReport, restoreWithRetry, RESTORE_REPORTS_KEY, RESTORE_REPORTS_MAX, type RestoreReport } from '../wallet-restore';

const noSleep = async () => undefined;

describe('restoreWithRetry', () => {
  it('reports "restored" on the first successful attempt without checking storage', async () => {
    const hasStoredSession = jest.fn(async () => true);
    const r = await restoreWithRetry({ attempt: async () => true, hasStoredSession, delaysMs: [1, 1], sleep: noSleep });
    expect(r).toEqual({ outcome: 'restored', attempts: 1, errors: [], hadStoredSession: true });
    expect(hasStoredSession).not.toHaveBeenCalled();
  });

  it('is a genuine logout when nothing is stored: no retry', async () => {
    const attempt = jest.fn(async () => {
      throw new Error('Failed to authenticate user.');
    });
    const r = await restoreWithRetry({ attempt, hasStoredSession: async () => false, delaysMs: [1, 1], sleep: noSleep });
    expect(r.outcome).toBe('no-session');
    expect(r.hadStoredSession).toBe(false);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('retries a failed restore while a session is stored, then succeeds', async () => {
    let n = 0;
    const slept: number[] = [];
    const r = await restoreWithRetry({
      attempt: async () => {
        n += 1;
        if (n < 3) throw new Error(`boom ${n}`);
        return true;
      },
      hasStoredSession: async () => true,
      delaysMs: [10, 20, 30],
      sleep: async (ms) => void slept.push(ms),
    });
    expect(r).toEqual({ outcome: 'restored', attempts: 3, errors: ['boom 1', 'boom 2'], hadStoredSession: true });
    expect(slept).toEqual([10, 20]);
  });

  it('reports "failed" (never "no-session") when every attempt fails with a stored session', async () => {
    const r = await restoreWithRetry({
      attempt: async () => {
        throw new Error('Network request failed');
      },
      hasStoredSession: async () => true,
      delaysMs: [1, 1],
      sleep: noSleep,
    });
    expect(r.outcome).toBe('failed');
    expect(r.attempts).toBe(3);
    expect(r.errors).toEqual(['Network request failed', 'Network request failed', 'Network request failed']);
  });

  it('treats an attempt that returns false with a stored session as a failure worth retrying', async () => {
    let n = 0;
    const r = await restoreWithRetry({
      attempt: async () => (n += 1) === 2,
      hasStoredSession: async () => true,
      delaysMs: [1],
      sleep: noSleep,
    });
    expect(r.outcome).toBe('restored');
    expect(r.attempts).toBe(2);
  });

  it('a storage check that throws counts as "stored": never log someone out on a storage error', async () => {
    const r = await restoreWithRetry({
      attempt: async () => {
        throw new Error('x');
      },
      hasStoredSession: async () => {
        throw new Error('storage down');
      },
      delaysMs: [],
      sleep: noSleep,
    });
    expect(r.outcome).toBe('failed');
    expect(r.hadStoredSession).toBe(true);
  });

  it('stops when cancelled', async () => {
    let cancelled = false;
    const attempt = jest.fn(async () => {
      cancelled = true;
      throw new Error('x');
    });
    const r = await restoreWithRetry({
      attempt,
      hasStoredSession: async () => true,
      delaysMs: [1, 1, 1],
      sleep: noSleep,
      isCancelled: () => cancelled,
    });
    expect(r.outcome).toBe('cancelled');
    expect(attempt).toHaveBeenCalledTimes(1);
  });
});

describe('appendRestoreReport', () => {
  const report = (i: number): RestoreReport => ({
    at: `2026-11-17T00:00:${String(i).padStart(2, '0')}Z`,
    outcome: 'failed',
    attempts: 1,
    errors: ['e'],
    hadStoredSession: true,
  });

  it('keeps only the newest reports and survives a corrupt stored value', async () => {
    const m = new Map<string, string>([[RESTORE_REPORTS_KEY, 'not json']]);
    const storage = {
      getItem: async (k: string) => m.get(k) ?? null,
      setItem: async (k: string, v: string) => void m.set(k, v),
    };
    for (let i = 0; i < RESTORE_REPORTS_MAX + 3; i++) await appendRestoreReport(storage, report(i));
    const stored = JSON.parse(m.get(RESTORE_REPORTS_KEY)!) as RestoreReport[];
    expect(stored).toHaveLength(RESTORE_REPORTS_MAX);
    expect(stored[stored.length - 1].at).toBe(report(RESTORE_REPORTS_MAX + 2).at);
  });

  it('never throws when storage fails', async () => {
    const storage = {
      getItem: async () => {
        throw new Error('down');
      },
      setItem: async () => {
        throw new Error('down');
      },
    };
    await expect(appendRestoreReport(storage, report(1))).resolves.toBeUndefined();
  });
});
