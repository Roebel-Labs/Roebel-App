/** Minimal `window` for testing ClientBridge under node. */
export interface FakeWindow {
  /** Every serialized/posted envelope the client sent to its host. */
  posted: string[];
  /** Deliver a message to the client's `message` listeners (objects or strings). */
  deliver(msg: unknown): void;
  restore(): void;
}

export function installFakeWindow(opts: { reactNative?: boolean } = {}): FakeWindow {
  const g = globalThis as { window?: unknown };
  const previous = g.window;
  const posted: string[] = [];
  const listeners = new Set<(ev: { data: unknown }) => void>();

  const win: Record<string, unknown> = {
    addEventListener(type: string, cb: (ev: { data: unknown }) => void) {
      if (type === 'message') listeners.add(cb);
    },
    removeEventListener(type: string, cb: (ev: { data: unknown }) => void) {
      if (type === 'message') listeners.delete(cb);
    },
    location: { search: '' },
  };
  if (opts.reactNative) {
    win.ReactNativeWebView = { postMessage: (data: string) => posted.push(data) };
  } else {
    win.parent = { postMessage: (data: unknown) => posted.push(JSON.stringify(data)) };
  }
  g.window = win;

  return {
    posted,
    deliver(msg) {
      for (const cb of [...listeners]) cb({ data: msg });
    },
    restore() {
      if (previous === undefined) delete g.window;
      else g.window = previous;
    },
  };
}
