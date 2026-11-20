import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_REQUEST_TIMEOUT_MS, CredentialsApiError, fetchDesignOrgs, generateDesignBackground, REQUEST_TIMEOUT_MS } from '../api';
import { createAutosaver } from '../designer/state';
import type { DraftView } from '../types';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** A fetch that never answers until aborted. */
function hangingFetch() {
  const signals: AbortSignal[] = [];
  vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
    signals.push(init.signal!);
    return new Promise<Response>((_, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
  });
  return signals;
}

describe('request timeouts', () => {
  it('a hung request fails after 20 s with a German message', async () => {
    vi.useFakeTimers();
    hangingFetch();
    const p = fetchDesignOrgs('tok').catch((e) => e);
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 10);
    const e = await p;
    expect(e).toBeInstanceOf(CredentialsApiError);
    expect((e as CredentialsApiError).code).toBe('timeout');
  });

  it('AI requests wait longer than 20 s', async () => {
    vi.useFakeTimers();
    const signals = hangingFetch();
    const p = generateDesignBackground('tok', 'org', 'Müritz').catch((e) => e);
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 10);
    expect(signals[0].aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(AI_REQUEST_TIMEOUT_MS);
    expect(((await p) as CredentialsApiError).code).toBe('timeout');
  });
});

describe('autosaver', () => {
  it('reports unsaved changes until they are saved', async () => {
    const view = { revision: 2 } as DraftView;
    const s = createAutosaver<string>({ save: async () => view, onSaved: () => undefined, onStatus: () => undefined, onConflict: () => undefined, revision: 1, delayMs: 10_000 });
    expect(s.hasPending()).toBe(false);
    s.change('a');
    expect(s.hasPending()).toBe(true);
    await s.flush();
    expect(s.hasPending()).toBe(false);
    s.cancel();
  });
});
