/**
 * The host events a mini app cannot see for itself: `visibilityChanged` (the host opened/closed
 * or the Röbel app went to / came back from the background), `themeChanged` (the person switched
 * light/dark while the app is open) and `back` (Android back, only for an app that said
 * `ready({ handlesBack: true })`).
 */

export interface HostSignals {
  /** The host modal is open. */
  open: boolean;
  /** The Röbel app is in the foreground. */
  appActive: boolean;
  /** The Röbel app shows its dark theme. */
  dark: boolean;
}

export type HostEvent =
  | { event: 'visibilityChanged'; data: { visible: boolean } }
  | { event: 'themeChanged'; data: { theme: 'light' | 'dark' } };

/** The events between two signal snapshots. The first snapshot (prev null) sends nothing. */
export function eventsFor(prev: HostSignals | null, next: HostSignals): HostEvent[] {
  if (!prev) return [];
  const out: HostEvent[] = [];
  const wasVisible = prev.open && prev.appActive;
  const visible = next.open && next.appActive;
  if (wasVisible !== visible) out.push({ event: 'visibilityChanged', data: { visible } });
  if (prev.open && next.open && prev.dark !== next.dark) {
    out.push({ event: 'themeChanged', data: { theme: next.dark ? 'dark' : 'light' } });
  }
  return out;
}

/** Android back: the app handles it (`event`), else the host closes. */
export function backPress(handlesBack: boolean): 'event' | 'close' {
  return handlesBack ? 'event' : 'close';
}
