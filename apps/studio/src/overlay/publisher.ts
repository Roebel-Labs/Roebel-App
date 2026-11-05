// Studio side of the OBS fallback: pushes ShowState snapshots to the overlay server's /state relay.
import type { ShowState } from '../state/types';

export const OVERLAY_STATE_URL = 'ws://127.0.0.1:7311/state?role=publisher';
const THROTTLE_MS = 100;
const RECONNECT_MS = 1000;

/** Starts publishing; returns a stop function. Sends on change (by reference), at most every 100 ms. */
export function startOverlayPublisher(getState: () => ShowState, url: string = OVERLAY_STATE_URL): () => void {
  let ws: WebSocket | null = null;
  let stopped = false;
  let lastSent: ShowState | null = null;
  let lastAt = 0;
  let reconnect: ReturnType<typeof setTimeout> | undefined;

  const send = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const state = getState();
    if (state === lastSent) return;
    lastSent = state;
    lastAt = Date.now();
    try {
      ws.send(JSON.stringify({ type: 'state', state, sentAt: lastAt }));
    } catch {
      /* socket closing; the reconnect resends */
    }
  };

  const connect = () => {
    if (stopped) return;
    try {
      ws = new WebSocket(url);
    } catch {
      reconnect = setTimeout(connect, RECONNECT_MS);
      return;
    }
    ws.onopen = () => {
      lastSent = null; // a (re)connected relay needs the current snapshot
      send();
    };
    ws.onclose = () => {
      ws = null;
      if (!stopped) reconnect = setTimeout(connect, RECONNECT_MS);
    };
    ws.onerror = () => ws?.close();
  };

  // Change detection polled at 100 ms: a reference compare is free and keeps the store untouched.
  const timer = setInterval(() => {
    if (Date.now() - lastAt >= THROTTLE_MS) send();
  }, THROTTLE_MS);
  connect();

  return () => {
    stopped = true;
    clearInterval(timer);
    clearTimeout(reconnect);
    ws?.close();
  };
}
