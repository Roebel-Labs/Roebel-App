import { createContext, useContext, useEffect, useReducer, useRef, type ReactNode } from 'react';
import { restore, serialize, showReducer, type Action } from './reducer';
import type { ShowState } from './types';

export const STORAGE_KEY = 'roebel-studio-v1';

type Ctx = { state: ShowState; dispatch: (a: Action) => void };
const StoreContext = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(showReducer, null, () => restore(localStorage.getItem(STORAGE_KEY)));
  const latest = useRef(state);
  latest.current = state;

  // Debounced autosave (500 ms) + flush on unload.
  useEffect(() => {
    const t = setTimeout(() => localStorage.setItem(STORAGE_KEY, serialize(state)), 500);
    return () => clearTimeout(t);
  }, [state]);

  useEffect(() => {
    const flush = () => localStorage.setItem(STORAGE_KEY, serialize(latest.current));
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
