/**
 * Which mini apps have unread notifications — in-memory, filled by the widget sync
 * (lib/widget-sync.ts) and read by the in-app icons. No native deps on purpose: UI
 * components import this, not the sync module.
 */
import { useEffect, useState } from 'react';

let unread = new Set<string>();
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((l) => l());
}

export function setUnreadMiniApps(slugs: Set<string>): void {
  unread = slugs;
  notify();
}

export function clearUnreadMiniApp(slug: string): void {
  if (!unread.has(slug)) return;
  unread = new Set([...unread].filter((s) => s !== slug));
  notify();
}

/** Unread mini-app slugs from the last sync — drives the in-app dots. */
export function useMiniAppUnread(): Set<string> {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return unread;
}
