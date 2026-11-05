// Tracks running "Testen" pushes app-wide, so "Auf Sendung gehen" can wait for them
// (main also aborts a running test when going live: a key is never pushed twice).

import { useSyncExternalStore } from 'react';

let running = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Counts `p` as a running test until it settles. */
export function trackTest<T>(p: Promise<T>): Promise<T> {
  running += 1;
  emit();
  return p.finally(() => {
    running -= 1;
    emit();
  });
}

export function testsRunning(): number {
  return running;
}

export function useTestRunning(): boolean {
  return (
    useSyncExternalStore(
      (cb) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
      () => running,
    ) > 0
  );
}
