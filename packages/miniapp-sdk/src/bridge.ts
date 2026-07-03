/**
 * Client-side bridge transport. Works identically in a web iframe and a React Native WebView.
 *
 *  - iframe:   posts to `window.parent`; host replies via `iframe.contentWindow.postMessage`.
 *  - RN WebView: posts to `window.ReactNativeWebView`; host replies by injecting a `message`
 *                event onto `window` (so the same `window` message listener handles both).
 */
import {
  NETIZEN_PROTOCOL,
  type BridgeError,
  type BridgeMessage,
  type BridgeMethod,
  type BridgeResponse,
  type NetizenEvent,
} from './types';

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage(data: string): void };
  }
}

const REQUEST_TIMEOUT_MS = 30_000;

function uuid(): string {
  // Prefer crypto.randomUUID; fall back to a non-crypto id (bridge ids are not secrets).
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

type Pending = {
  resolve: (v: unknown) => void;
  reject: (e: BridgeError) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class ClientBridge {
  private pending = new Map<string, Pending>();
  private listeners = new Map<NetizenEvent, Set<(data: unknown) => void>>();
  private started = false;

  start(): void {
    if (this.started || typeof window === 'undefined') return;
    this.started = true;
    window.addEventListener('message', this.onMessage);
  }

  private onMessage = (ev: MessageEvent): void => {
    const msg = parse(ev.data);
    if (!msg || msg.netizen !== NETIZEN_PROTOCOL) return;

    // A client only ever receives responses (id, no method) and events.
    if ('id' in msg && msg.id && !('method' in msg)) {
      const res = msg as BridgeResponse;
      const p = this.pending.get(res.id);
      if (!p) return;
      this.pending.delete(res.id);
      clearTimeout(p.timer);
      if (res.error) p.reject(res.error);
      else p.resolve(res.result);
      return;
    }

    if ('event' in msg && msg.event) {
      const set = this.listeners.get(msg.event);
      if (set) for (const cb of set) safeCall(cb, msg.data);
    }
  };

  /** Send a request and await the host's reply. */
  request<T = unknown>(method: BridgeMethod, params?: unknown): Promise<T> {
    this.start();
    const id = uuid();
    const envelope: BridgeMessage = { netizen: NETIZEN_PROTOCOL, id, method, params };
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject({ code: 'timeout', message: `"${method}" timed out` });
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      try {
        post(envelope);
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject({ code: 'internal', message: String(e) });
      }
    });
  }

  /** Fire-and-forget send (no reply awaited) — used by analytics.track. */
  notify(method: BridgeMethod, params?: unknown): void {
    this.start();
    try {
      post({ netizen: NETIZEN_PROTOCOL, id: uuid(), method, params });
    } catch {
      /* swallow — analytics/notify must never throw */
    }
  }

  on(event: NetizenEvent, cb: (data: unknown) => void): () => void {
    this.start();
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(cb);
    return () => set!.delete(cb);
  }
}

function post(envelope: BridgeMessage): void {
  const w = window;
  const serialized = JSON.stringify(envelope);
  if (w.ReactNativeWebView) {
    w.ReactNativeWebView.postMessage(serialized);
  } else if (w.parent && w.parent !== w) {
    w.parent.postMessage(envelope, '*');
  } else {
    // No host detected (e.g. app opened standalone in a browser tab).
    throw new Error('no Netizen host detected');
  }
}

function parse(data: unknown): BridgeMessage | null {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as BridgeMessage;
    } catch {
      return null;
    }
  }
  if (data && typeof data === 'object' && (data as { netizen?: unknown }).netizen === NETIZEN_PROTOCOL) {
    return data as BridgeMessage;
  }
  return null;
}

function safeCall(cb: (data: unknown) => void, data: unknown): void {
  try {
    cb(data);
  } catch {
    /* listener errors must not break the bridge */
  }
}
