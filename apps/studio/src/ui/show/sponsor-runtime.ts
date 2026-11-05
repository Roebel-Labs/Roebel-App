import { useEffect, useRef } from 'react';
import { cachedImage, imageFailed } from '../../render/draw';
import { useShow } from '../../state/store';
import type { ShowState } from '../../state/types';

/** Ids of partners whose logo could not be loaded. */
export function failedSponsorIds(s: ShowState): string[] {
  return s.sponsors.items.filter((i) => i.logoUrl && imageFailed(i.logoUrl)).map((i) => i.id);
}

type Running = { id: string; name: string; startedAt: number };

/**
 * Runs the Werbeblock for the whole app (it must keep going on other tabs): rotates the spot every
 * rotationSeconds and logs every spot that leaves the air to werbung-airtime.jsonl.
 */
export function useSponsorRuntime() {
  const { state, dispatch } = useShow();
  const latest = useRef(state);
  latest.current = state;
  const { breakActive, currentId, rotationSeconds } = state.sponsors;

  // Preload logos so a broken one is known before it would go on air.
  const logos = state.sponsors.items.map((i) => i.logoUrl ?? '').join('|');
  useEffect(() => {
    for (const i of latest.current.sponsors.items) if (i.logoUrl) cachedImage(i.logoUrl);
  }, [logos]);

  useEffect(() => {
    if (!breakActive) return;
    const t = setInterval(() => dispatch({ type: 'nextSpot', failedIds: failedSponsorIds(latest.current) }), rotationSeconds * 1000);
    return () => clearInterval(t);
  }, [breakActive, rotationSeconds, dispatch]);

  // Air-time log: one entry per spot, written when it leaves the air.
  const running = useRef<Running | null>(null);
  useEffect(() => {
    const flush = () => {
      const r = running.current;
      running.current = null;
      if (!r) return;
      void window.studio.fs
        .appendAirLog({
          recordDir: latest.current.settings.recordDir,
          sponsorId: r.id,
          name: r.name,
          startedAt: new Date(r.startedAt).toISOString(),
          endedAt: new Date().toISOString(),
        })
        .catch(() => {});
    };
    if (running.current && running.current.id !== (breakActive ? currentId : null)) flush();
    if (breakActive && currentId && !running.current) {
      const item = latest.current.sponsors.items.find((i) => i.id === currentId);
      running.current = { id: currentId, name: item?.name ?? '', startedAt: Date.now() };
    }
  }, [breakActive, currentId]);

  useEffect(() => {
    const onUnload = () => {
      const r = running.current;
      if (!r) return;
      running.current = null;
      void window.studio.fs
        .appendAirLog({
          recordDir: latest.current.settings.recordDir,
          sponsorId: r.id,
          name: r.name,
          startedAt: new Date(r.startedAt).toISOString(),
          endedAt: new Date().toISOString(),
        })
        .catch(() => {});
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, []);
}
