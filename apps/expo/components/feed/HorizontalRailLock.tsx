import React, { createContext, useContext, useMemo } from 'react';

/**
 * Horizontal rails inside a horizontally paged screen (the Austausch feed:
 * stories, Mittagstisch, post media sliders, news/cinema/restaurant rails)
 * must never let a swipe fall through to the page pager and flip the tab
 * (e.g. into "Umfragen").
 *
 * The pager provides `setRailActive`; every horizontal rail spreads
 * `useRailLockTouchHandlers()` onto its ScrollView/FlatList. The pager locks
 * imperatively (no React re-render), so the lock lands before the native
 * pager can claim the gesture.
 *
 * Outside a provider the handlers are no-ops, so shared components can use
 * the hook unconditionally.
 */
type RailLock = {
  setRailActive: (active: boolean) => void;
};

const RailLockContext = createContext<RailLock | null>(null);

export function HorizontalRailLockProvider({
  setRailActive,
  children,
}: {
  setRailActive: (active: boolean) => void;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ setRailActive }), [setRailActive]);
  return <RailLockContext.Provider value={value}>{children}</RailLockContext.Provider>;
}

const NOOP_HANDLERS = {};

export type RailLockTouchHandlers = {
  onTouchStart?: () => void;
  onTouchEnd?: () => void;
  onTouchCancel?: () => void;
  onScrollEndDrag?: () => void;
};

export function useRailLockTouchHandlers(): RailLockTouchHandlers {
  const ctx = useContext(RailLockContext);
  return useMemo(() => {
    if (!ctx) return NOOP_HANDLERS;
    const lock = () => ctx.setRailActive(true);
    const unlock = () => ctx.setRailActive(false);
    return {
      onTouchStart: lock,
      onTouchEnd: unlock,
      onTouchCancel: unlock,
      // Safety net: if a touch-end gets swallowed by the native scroller,
      // releasing the drag still unlocks the pager.
      onScrollEndDrag: unlock,
    };
  }, [ctx]);
}
