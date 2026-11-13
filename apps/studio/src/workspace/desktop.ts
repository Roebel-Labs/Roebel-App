// Tray / global-shortcut commands from main (installer ≥ 0.2.0). Older shells: no-ops.

export type DesktopCommand =
  | { kind: 'compose' }
  | { kind: 'search' }
  | { kind: 'settings'; section?: 'appearance' | 'connections' | 'keys' | 'account' }
  | { kind: 'signedin' }
  | { kind: 'connected'; provider: 'google'; result: 'ok' | 'cancelled' | 'error' }
  | { kind: 'toggleList' }
  /** Keyboard shortcuts handled by the workspace (Start). */
  | { kind: 'newChat' }
  | { kind: 'togglePanel' }
  | { kind: 'dictate' }
  | { kind: 'signout' }
  | { kind: 'navigate'; section: 'home' | 'live' | 'wiki' | 'skills' | 'agent' }
  /** Open a thread in Start; `message` is sent as the first user message once the thread is on screen. */
  | { kind: 'openThread'; threadId: string; message?: string }
  | { kind: 'capture'; name: string; type: string; bytes: Uint8Array };

type Bridge = { onCommand(cb: (c: DesktopCommand) => void): () => void };

const listeners = new Set<(c: DesktopCommand) => void>();
let unsubscribe: (() => void) | null = null;
/** A command that arrived before the workspace mounted (e.g. capture while on another section). */
let pending: DesktopCommand | null = null;

function bridge(): Bridge | null {
  const d = (globalThis as { window?: { studio?: { desktop?: Bridge } } }).window?.studio?.desktop;
  return d && typeof d.onCommand === 'function' ? d : null;
}

/** One IPC subscription fanned out to every listener. */
export function onDesktopCommand(cb: (c: DesktopCommand) => void): () => void {
  listeners.add(cb);
  if (!unsubscribe) {
    unsubscribe =
      bridge()?.onCommand((c) => {
        pending = c;
        for (const l of listeners) l(c);
      }) ?? (() => {});
  }
  return () => {
    listeners.delete(cb);
  };
}

/** The workspace takes a command that was sent while it was not mounted yet (at most a few seconds old). */
export function takePending(): DesktopCommand | null {
  const c = pending;
  pending = null;
  return c;
}

export function markHandled(): void {
  pending = null;
}

/** In-app commands (toolbar) use the same bus as the tray, so the workspace handles both alike. */
export function emitCommand(c: DesktopCommand): void {
  pending = c;
  for (const l of listeners) l(c);
}
