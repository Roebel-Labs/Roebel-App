/**
 * Account switch flow (pure parts): what a tap on "Account wechseln" does, and the timing of the
 * branded switch overlay (like Airbnb's "Switching to traveling").
 *
 *   one other account   → overlay → switch
 *   two or more others  → picker sheet → overlay → switch
 */
import type { Account } from './types';

/** The overlay stays up at least this long so the switch reads as a deliberate moment. */
export const MIN_VISIBLE_MS = 900;
export const OVERLAY_FADE_IN_MS = 150;
export const OVERLAY_FADE_OUT_MS = 200;
/** RN fetch has no timeout: a black-holed switch must not leave the full-screen overlay up forever. */
export const SWITCH_TIMEOUT_MS = 10_000;

export type SwitchStart = { kind: 'direct'; targetId: string } | { kind: 'sheet' } | { kind: 'none' };

export function decideSwitchStart(input: { activeId: string | null; accounts: Account[] }): SwitchStart {
  const others = input.accounts.filter((a) => a.id !== input.activeId);
  if (others.length === 0) return { kind: 'none' };
  if (others.length === 1) return { kind: 'direct', targetId: others[0].id };
  return { kind: 'sheet' };
}

/** Avatar on the pill: the one account you would switch to, otherwise the current one. */
export function pillAvatarAccount(activeId: string | null, accounts: Account[]): Account | null {
  const others = accounts.filter((a) => a.id !== activeId);
  if (others.length === 1) return others[0];
  return accounts.find((a) => a.id === activeId) ?? null;
}

type RunnerDeps = {
  switchAccount: (id: string) => Promise<void>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  onStart: (id: string) => void;
  onDone: (id: string) => void;
  onError: (err: unknown) => void;
};

/** One switch at a time; the overlay is held for at least MIN_VISIBLE_MS. */
export function createSwitchRunner(deps: RunnerDeps): { run(id: string): Promise<void>; isRunning(): boolean } {
  let running = false;
  return {
    isRunning: () => running,
    async run(id: string) {
      if (running) return;
      running = true;
      const startedAt = deps.now();
      deps.onStart(id);
      try {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Account switch timed out')), SWITCH_TIMEOUT_MS);
        });
        try {
          await Promise.race([deps.switchAccount(id), timeout]);
        } finally {
          clearTimeout(timer);
        }
        const remaining = MIN_VISIBLE_MS - (deps.now() - startedAt);
        if (remaining > 0) await deps.sleep(remaining);
        running = false;
        deps.onDone(id);
      } catch (err) {
        running = false;
        deps.onError(err);
      }
    },
  };
}
