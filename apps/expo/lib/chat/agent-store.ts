// One cached copy of the agent view (main assistant + roster) per signed-in account, shared by the agent
// screens: the roster, the detail screen and the character picker all read and update the same state.
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { SigningAccount } from '@/lib/signed-request';
import { ChatApiError, fetchAgentView } from './api';
import type { AgentView } from './agents';

export type AgentStoreState =
  | { status: 'idle' | 'loading'; view: null; error: null }
  | { status: 'ready'; view: AgentView; error: null }
  | { status: 'error'; view: null; error: string };

const INITIAL: AgentStoreState = { status: 'idle', view: null, error: null };

let state: AgentStoreState = INITIAL;
/** Lower-cased account key the state belongs to (never displayed). */
let owner: string | null = null;
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(next: AgentStoreState): void {
  state = next;
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const snapshot = () => state;

function claim(key: string): void {
  if (owner === key) return;
  owner = key;
  inFlight = null;
  set(INITIAL);
}

/** Stores a view returned by a mutation (every agent endpoint answers with the full view). */
export function setAgentView(account: SigningAccount, view: AgentView): void {
  claim(account.address.toLowerCase());
  set({ status: 'ready', view, error: null });
}

/** Loads the view; a quiet refresh never throws away what is on screen. */
export function loadAgentView(account: SigningAccount, quiet = false): Promise<void> {
  const key = account.address.toLowerCase();
  claim(key);
  if (inFlight) return inFlight;
  if (!quiet || state.status !== 'ready') {
    if (state.status !== 'ready') set({ status: 'loading', view: null, error: null });
  }
  const run = (async () => {
    try {
      const view = await fetchAgentView(account);
      if (owner === key) set({ status: 'ready', view, error: null });
    } catch (err) {
      if (owner !== key || state.status === 'ready') return;
      const message = err instanceof ChatApiError && err.message ? err.message : 'Deine Agenten konnten nicht geladen werden.';
      set({ status: 'error', view: null, error: message });
    } finally {
      if (owner === key) inFlight = null;
    }
  })();
  inFlight = run;
  return run;
}

/** Subscribes to the agent view of `account` and loads it on mount. */
export function useAgentView(account: SigningAccount | null): AgentStoreState & { reload: (quiet?: boolean) => Promise<void> } {
  const current = useSyncExternalStore(subscribe, snapshot, snapshot);
  const key = account ? account.address.toLowerCase() : null;
  useEffect(() => {
    if (account) void loadAgentView(account, true);
    // Re-run only when the signed-in account changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const reload = useCallback(
    (quiet = false) => (account ? loadAgentView(account, quiet) : Promise.resolve()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  // State of another account (or none) is never shown.
  const mine = key && owner === key ? current : INITIAL;
  return { ...mine, reload };
}
