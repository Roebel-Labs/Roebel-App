import { useEffect, useRef } from 'react';
import { cachedImage, imageFailed } from '../../render/draw';
import { useShow } from '../../state/store';
import type { ShowState } from '../../state/types';

/** Ids of partners whose logo could not be loaded. */
export function failedSponsorIds(s: ShowState): string[] {
  return s.sponsors.items.filter((i) => i.logoUrl && imageFailed(i.logoUrl)).map((i) => i.id);
}

type Running = { id: string; name: string; startedAt: number };

// Module-level so the quit handshake (App) can flush the spot that is on air.
let running: Running | null = null;
let recordDir = '';
const pending = new Set<Promise<unknown>>();

/** Writes the finished spot to werbung-airtime.jsonl (single place for every flush). */
function logSpot(r: Running, dir: string): Promise<unknown> {
  const p = window.studio.fs
    .appendAirLog({
      recordDir: dir,
      sponsorId: r.id,
      name: r.name,
      startedAt: new Date(r.startedAt).toISOString(),
      endedAt: new Date().toISOString(),
    })
    .catch(() => {});
  pending.add(p);
  void p.finally(() => pending.delete(p));
  return p;
}

function flush(): void {
  const r = running;
  running = null;
  if (r) logSpot(r, recordDir);
}

/** Quit handshake: logs the spot on air and waits for the writes (bounded by the caller's grace). */
export async function flushSponsorLog(): Promise<void> {
  flush();
  await Promise.all([...pending]);
}

/**
 * Runs the Werbeblock for the whole app (it must keep going on other tabs): rotates the spot every
 * rotationSeconds and logs every spot that leaves the air to werbung-airtime.jsonl.
 */
export function useSponsorRuntime() {
  const { state, dispatch } = useShow();
  const latest = useRef(state);
  latest.current = state;
  recordDir = state.settings.recordDir;
  const { breakActive, currentId, rotationSeconds } = state.sponsors;

  // Preload logos so a broken one is known before it would go on air.
  const logos = state.sponsors.items.map((i) => i.logoUrl ?? '').join('|');
  useEffect(() => {
    for (const i of latest.current.sponsors.items) if (i.logoUrl) cachedImage(i.logoUrl);
  }, [logos]);

  // Restarts on every spot change, so a manual advance (remove, logo change) gives the new spot its full time.
  useEffect(() => {
    if (!breakActive) return;
    const t = setInterval(() => dispatch({ type: 'nextSpot', failedIds: failedSponsorIds(latest.current) }), rotationSeconds * 1000);
    return () => clearInterval(t);
  }, [breakActive, currentId, rotationSeconds, dispatch]);

  // Air-time log: one entry per spot, written when it leaves the air.
  useEffect(() => {
    if (running && running.id !== (breakActive ? currentId : null)) flush();
    if (breakActive && currentId && !running) {
      const item = latest.current.sponsors.items.find((i) => i.id === currentId);
      running = { id: currentId, name: item?.name ?? '', startedAt: Date.now() };
    }
  }, [breakActive, currentId]);

  useEffect(() => {
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, []);
}
