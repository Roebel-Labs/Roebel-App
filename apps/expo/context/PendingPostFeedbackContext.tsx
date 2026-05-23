import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

export type PendingPostFeedback = {
  message: string;
};

type PendingPostFeedbackContextValue = {
  pending: PendingPostFeedback | null;
  signal: (payload: PendingPostFeedback) => void;
  /** Returns the pending feedback and clears it. Safe to call repeatedly. */
  consume: () => PendingPostFeedback | null;
};

const PendingPostFeedbackContext = createContext<PendingPostFeedbackContextValue | undefined>(undefined);

/**
 * Carries a one-shot "post successfully created" signal across navigation —
 * `CreatePostProvider` is scoped to /create/_layout.tsx and unmounts when we
 * `router.dismissAll()` back to the feed, so we need a root-mounted context
 * to hand off the snackbar message + refresh trigger to FeedHome.
 */
export function PendingPostFeedbackProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingPostFeedback | null>(null);
  const pendingRef = useRef<PendingPostFeedback | null>(null);

  const signal = useCallback((payload: PendingPostFeedback) => {
    pendingRef.current = payload;
    setPending(payload);
  }, []);

  const consume = useCallback((): PendingPostFeedback | null => {
    const current = pendingRef.current;
    if (current) {
      pendingRef.current = null;
      setPending(null);
    }
    return current;
  }, []);

  const value = useMemo(() => ({ pending, signal, consume }), [pending, signal, consume]);

  return <PendingPostFeedbackContext.Provider value={value}>{children}</PendingPostFeedbackContext.Provider>;
}

export function usePendingPostFeedback(): PendingPostFeedbackContextValue {
  const ctx = useContext(PendingPostFeedbackContext);
  if (!ctx) {
    throw new Error('usePendingPostFeedback must be used within PendingPostFeedbackProvider');
  }
  return ctx;
}
