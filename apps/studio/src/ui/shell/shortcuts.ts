// Keyboard shortcuts of the interface: one table used by the key handler (App), the tooltips and
// Einstellungen → Tastenkürzel. All of them use ⌘ (macOS) or Ctrl (elsewhere); plain letters are never
// bound, so typing is never hijacked.

export type ShortcutId =
  | 'search' | 'newChat' | 'toggleList' | 'togglePanel' | 'back' | 'forward'
  | 'goHome' | 'goForYou' | 'goSkills' | 'goWiki' | 'goLibrary' | 'settings' | 'quickAsk';

export interface Shortcut {
  id: ShortcutId;
  label: string;
  /** `KeyboardEvent.key` (case-insensitive). */
  key: string;
  shift?: boolean;
  group: 'Allgemein' | 'Start' | 'Bereiche';
  /** Handled outside the renderer (system-wide shortcut registered by the desktop shell): listed, not matched. */
  external?: boolean;
}

export const SHORTCUTS: ReadonlyArray<Shortcut> = [
  { id: 'search', label: 'Suchen', key: 'k', group: 'Allgemein' },
  { id: 'settings', label: 'Einstellungen', key: ',', group: 'Allgemein' },
  { id: 'back', label: 'Zurück', key: '[', group: 'Allgemein' },
  { id: 'forward', label: 'Vor', key: ']', shift: true, group: 'Allgemein' },
  { id: 'quickAsk', label: 'Nachricht von überall (auch außerhalb von Ortis)', key: 'Space', shift: true, group: 'Allgemein', external: true },
  { id: 'newChat', label: 'Neue Unterhaltung', key: 'n', group: 'Start' },
  { id: 'toggleList', label: 'Seitenleiste ein- oder ausblenden', key: 'b', group: 'Start' },
  { id: 'togglePanel', label: 'Details zur Unterhaltung', key: ']', group: 'Start' },
  { id: 'goHome', label: 'Start', key: '1', group: 'Bereiche' },
  { id: 'goForYou', label: 'Für dich', key: '2', group: 'Bereiche' },
  { id: 'goSkills', label: 'Funktionen', key: '3', group: 'Bereiche' },
  { id: 'goWiki', label: 'Wiki', key: '4', group: 'Bereiche' },
  { id: 'goLibrary', label: 'Bibliothek', key: '5', group: 'Bereiche' },
];

export function isMac(): boolean {
  const g = globalThis as { window?: { studio?: { ui?: { platform?: string } } }; navigator?: { platform?: string; userAgent?: string } };
  const p = g.window?.studio?.ui?.platform;
  if (p && p !== 'web') return p === 'darwin';
  return /mac/i.test(g.navigator?.platform || g.navigator?.userAgent || '');
}

/** Keycap parts, e.g. ['⌘', 'K'] on macOS and ['Ctrl', 'K'] elsewhere. */
export function shortcutKeys(s: Pick<Shortcut, 'key' | 'shift'>, mac = isMac()): string[] {
  const key = s.key === 'Space' ? (mac ? 'Leertaste' : 'Leertaste') : s.key.toUpperCase();
  return [mac ? '⌘' : 'Ctrl', ...(s.shift ? [mac ? '⇧' : 'Shift'] : []), key];
}

/** Keycap text for a tooltip, or undefined for an unknown id. */
export function shortcutHint(id: ShortcutId, mac = isMac()): string | undefined {
  const s = SHORTCUTS.find((x) => x.id === id);
  return s ? shortcutKeys(s, mac).join(' ') : undefined;
}

export interface KeyLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  repeat?: boolean;
}

// With Shift held, `key` reports the shifted character on most layouts.
const SHIFTED: Record<string, string> = { ']': '}', '[': '{' };

/** The shortcut a key event stands for, or null. The platform modifier must be the only one of ⌘ / Ctrl. */
export function matchShortcut(e: KeyLike, mac = isMac()): ShortcutId | null {
  if (e.repeat) return null;
  if (mac ? !e.metaKey || e.ctrlKey : !e.ctrlKey || e.metaKey) return null;
  const key = e.key.toLowerCase();
  for (const s of SHORTCUTS) {
    if (s.external || !!s.shift !== e.shiftKey) continue;
    if (key === s.key.toLowerCase() || (s.shift && key === SHIFTED[s.key])) return s.id;
  }
  return null;
}

/** Section history for Zurück / Vor: a visited list with a cursor. */
export interface NavHistory<T> {
  items: T[];
  at: number;
}

export function historyPush<T>(h: NavHistory<T>, next: T, max = 50): NavHistory<T> {
  if (h.items[h.at] === next) return h;
  const items = [...h.items.slice(0, h.at + 1), next].slice(-max);
  return { items, at: items.length - 1 };
}

export function historyMove<T>(h: NavHistory<T>, delta: -1 | 1): NavHistory<T> {
  const at = h.at + delta;
  return at < 0 || at >= h.items.length ? h : { items: h.items, at };
}
