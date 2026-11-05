// OBS browser-source page: transparent 1920×1080 canvas, driven by ShowState snapshots from the studio.
import { renderFrame } from '../render/draw';
import { loadFonts } from '../render/fonts';
import { defaultRenderContext } from '../media/program';
import type { OverlayProjection } from './projection';
import type { ShowState } from '../state/types';

// Always the studio's server (also works when this page is served by the vite dev server).
const STATE_URL = 'ws://127.0.0.1:7311/state';
const RECONNECT_MS = 1000;
const FRAME_MS = 1000 / 30;

let state: (ShowState & Partial<Pick<OverlayProjection, 'live'>>) | null = null;
// Overlays-only never reads media, so the lookup stays empty.
const noMedia = () => null;

function connect() {
  const ws = new WebSocket(STATE_URL);
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(String(e.data));
      if (msg && msg.type === 'state' && msg.state) state = msg.state as ShowState; // projection: overlays, templates, table, sponsors, live only
    } catch {
      /* ignore garbage */
    }
  };
  ws.onclose = () => setTimeout(connect, RECONNECT_MS); // last state stays on screen
  ws.onerror = () => ws.close();
}

async function main() {
  await loadFonts();
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  let last = 0;
  const tick = (t: number) => {
    requestAnimationFrame(tick);
    if (t - last < FRAME_MS - 1) return;
    last = t;
    if (!state) return;
    // The chat highlight comes from the studio's projection, not from this page's (empty) live-room store.
    const live = { chatHighlight: state.live?.chatHighlight ?? null };
    renderFrame(ctx, state, noMedia as never, defaultRenderContext(state, live), Date.now(), { overlaysOnly: true });
  };
  requestAnimationFrame(tick);
  connect();
}

void main();
