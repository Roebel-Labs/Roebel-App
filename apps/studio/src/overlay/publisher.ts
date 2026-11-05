// Studio side of the OBS fallback: pushes a key-free projection of the show to the overlay server's /state relay.
import { OVERLAY_PORT } from './constants';
import { liveRoomChatHighlight } from '../live-room/seams';
import { overlayProjection } from './projection';
import type { ShowState } from '../state/types';

export const OVERLAY_STATE_URL = `ws://127.0.0.1:${OVERLAY_PORT}/state`;
const THROTTLE_MS = 100;
const RECONNECT_MS = 1000;
const MAX_BYTES = 4.5 * 1024 * 1024; // server limit is 5 MB

type Options = { url?: string; getToken?: () => Promise<string | null> };

async function ipcToken(): Promise<string | null> {
  try {
    const st = (await window.studio?.overlay?.status()) as { publisherToken?: string } | undefined;
    return st?.publisherToken ?? null;
  } catch {
    return null;
  }
}

/** Starts publishing; returns a stop function. Sends on projection change, at most every 100 ms. */
export function startOverlayPublisher(getState: () => ShowState, opts: Options = {}): () => void {
  const base = opts.url ?? OVERLAY_STATE_URL;
  const getToken = opts.getToken ?? ipcToken;
  let ws: WebSocket | null = null;
  let stopped = false;
  let lastSent: unknown = null;
  let lastAt = 0;
  let warnedOversize = false;
  let reconnect: ReturnType<typeof setTimeout> | undefined;

  const send = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const proj = overlayProjection(getState(), { chatHighlight: liveRoomChatHighlight.get() });
    if (proj === lastSent) return;
    lastSent = proj; // also for oversize: do not retry the same snapshot
    lastAt = Date.now();
    const text = JSON.stringify({ type: 'state', state: proj, sentAt: lastAt });
    if (text.length > MAX_BYTES) {
      if (!warnedOversize) console.warn('[overlay] state too large for the OBS relay; not sent');
      warnedOversize = true;
      return;
    }
    try {
      ws.send(text);
    } catch {
      /* socket closing; the reconnect resends */
    }
  };

  const connect = async () => {
    if (stopped) return;
    const token = await getToken();
    if (stopped) return;
    try {
      const sock = new WebSocket(`${base}?role=publisher&token=${encodeURIComponent(token ?? '')}`);
      ws = sock;
      sock.onopen = () => {
        lastSent = null; // a (re)connected relay needs the current snapshot
        send();
      };
      sock.onclose = () => {
        if (ws === sock) ws = null;
        if (!stopped) reconnect = setTimeout(connect, RECONNECT_MS);
      };
      sock.onerror = () => sock.close();
    } catch {
      reconnect = setTimeout(connect, RECONNECT_MS);
    }
  };

  const timer = setInterval(() => {
    if (Date.now() - lastAt >= THROTTLE_MS) send();
  }, THROTTLE_MS);
  void connect();

  return () => {
    stopped = true;
    clearInterval(timer);
    clearTimeout(reconnect);
    ws?.close();
  };
}
