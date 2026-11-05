import { createContext, useContext, useEffect, useReducer, useRef, type ReactNode } from 'react';
import { restore, serialize, showReducer, type Action } from './reducer';
import { startOverlayPublisher } from '../overlay/publisher';
import type { ShowState } from './types';

// Legacy name from before the rename to Ortis Studio; kept unchanged so saved shows keep loading.
export const STORAGE_KEY = 'roebel-studio-v1';

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(json: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, json);
  } catch {
    // quota / security errors must never crash the show
  }
}

type Ctx = { state: ShowState; dispatch: (a: Action) => void };
const StoreContext = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(showReducer, null, () => restore(readStored()));
  const latest = useRef(state);
  latest.current = state;

  // Debounced autosave (500 ms) + flush on unload.
  useEffect(() => {
    const t = setTimeout(() => writeStored(serialize(state)), 500);
    return () => clearTimeout(t);
  }, [state]);

  // Feed the OBS browser-source fallback (overlay server /state relay).
  useEffect(() => startOverlayPublisher(() => latest.current), []);

  useEffect(() => {
    const flush = () => writeStored(serialize(latest.current));
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, []);

  return <StoreContext.Provider value={{ state, dispatch }}>{children}</StoreContext.Provider>;
}

export function useShow(): Ctx {
  const c = useContext(StoreContext);
  if (!c) throw new Error('useShow must be used inside <StoreProvider>');
  return c;
}
