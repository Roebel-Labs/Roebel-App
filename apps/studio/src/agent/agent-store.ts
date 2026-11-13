// The assistant's profile, shared by the Start page (display name) and the "Assistent" page. One cached
// copy per session; `null` means the endpoint is not available (older backend) and every entry point hides.
import { useEffect, useState } from 'react';
import { ChatApiError, fetchAgent, type Agent, type AgentResponse } from '../workspace/api';

export type AgentState = { status: 'loading' } | { status: 'unavailable' } | { status: 'error'; message: string } | { status: 'ready'; data: AgentResponse };

let state: AgentState = { status: 'loading' };
let loadedFor: string | null = null;
const listeners = new Set<(s: AgentState) => void>();

function set(next: AgentState): void {
  state = next;
  for (const l of listeners) l(next);
}

export function setAgentData(data: AgentResponse): void {
  set({ status: 'ready', data });
}

export async function loadAgent(token: string, quiet = false): Promise<AgentState> {
  loadedFor = token;
  if (!quiet && state.status !== 'ready') set({ status: 'loading' });
  try {
    const data = await fetchAgent(token);
    if (loadedFor === token) set({ status: 'ready', data });
  } catch (e) {
    if (loadedFor !== token) return state;
    // A background refresh never throws away what is on screen.
    if (quiet && state.status === 'ready') return state;
    if (e instanceof ChatApiError && e.status === 404) set({ status: 'unavailable' });
    else set({ status: 'error', message: (e as Error).message || 'Das hat nicht geklappt.' });
  }
  return state;
}

/** Subscribes to the profile and loads it once per session token. */
export function useAgent(token: string | null): AgentState {
  const [s, setS] = useState<AgentState>(state);
  useEffect(() => {
    listeners.add(setS);
    setS(state);
    if (token && loadedFor !== token) void loadAgent(token);
    return () => void listeners.delete(setS);
  }, [token]);
  return token ? s : { status: 'unavailable' };
}

export function agentOf(s: AgentState): Agent | null {
  return s.status === 'ready' ? s.data.agent : null;
}
