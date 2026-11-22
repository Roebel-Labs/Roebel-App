// Animated agent loops (animated WebP on the website, made by apps/web/scripts/gen-agent-animations.mjs on main):
// `idle` plays a short burst when an avatar comes into view and now and then while it stays visible; `writing`
// loops while the agent works. Everything here degrades to the still tile: offline, failed download or
// prefers-reduced-motion simply never shows the overlay.
import { useEffect, useRef, useState } from 'react';
import { API_BASE } from '../live-room/config';

export type MascotAnimation = 'idle' | 'writing';

/** One loop of the generated animations: 16 frames × 110 ms. */
export const MASCOT_LOOP_MS = 16 * 110;

export function mascotUrl(id: string, kind: MascotAnimation): string {
  return `${API_BASE}/agents/${encodeURIComponent(id)}/${kind}.webp`;
}

// One download per file; each burst gets a fresh object URL so the animation starts at frame 0 (an <img> that
// reuses a URL continues the shared animation timeline).
const blobs = new Map<string, Promise<Blob | null>>();
function loadBlob(url: string): Promise<Blob | null> {
  let p = blobs.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? r.blob() : null))
      .catch(() => null);
    blobs.set(url, p);
  }
  return p;
}

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Random pause between idle bursts while visible: 9–24 s. */
function nextIdleDelay(): number {
  return 9000 + Math.random() * 15000;
}

/**
 * The object URL to overlay right now, or null for the still tile. `target` is the element whose visibility
 * drives idle bursts.
 */
export function useMascotAnimation(
  target: React.RefObject<HTMLElement | null>,
  id: string | null,
  kind: MascotAnimation | false,
): string | null {
  const [src, setSrc] = useState<string | null>(null);
  const current = useRef<string | null>(null);

  useEffect(() => {
    if (!id || !kind || reducedMotion()) return;
    const url = mascotUrl(id, kind);
    let alive = true;
    let stopTimer: number | undefined;
    let nextTimer: number | undefined;
    let visible = false;
    let playing = false;

    const show = async (ms: number | null) => {
      const blob = await loadBlob(url);
      if (!alive || !blob) return;
      if (current.current) URL.revokeObjectURL(current.current);
      current.current = URL.createObjectURL(blob);
      setSrc(current.current);
      if (ms != null) {
        playing = true;
        stopTimer = window.setTimeout(() => {
          playing = false;
          setSrc(null);
          scheduleNext();
        }, ms);
      }
    };

    const scheduleNext = () => {
      window.clearTimeout(nextTimer);
      nextTimer = window.setTimeout(() => {
        if (alive && visible && !playing && !document.hidden) void show(MASCOT_LOOP_MS);
        else if (alive) scheduleNext();
      }, nextIdleDelay());
    };

    if (kind === 'writing') {
      void show(null);
      return () => {
        alive = false;
        setSrc(null);
      };
    }

    const el = target.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        const now = entry.isIntersecting;
        if (now && !visible && !playing) void show(2 * MASCOT_LOOP_MS); // just came into view
        visible = now;
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    scheduleNext();
    return () => {
      alive = false;
      io.disconnect();
      window.clearTimeout(stopTimer);
      window.clearTimeout(nextTimer);
      setSrc(null);
    };
  }, [id, kind, target]);

  // Revoke the last object URL once the overlay is gone.
  useEffect(() => {
    if (src === null && current.current) {
      const old = current.current;
      current.current = null;
      window.setTimeout(() => URL.revokeObjectURL(old), 400);
    }
  }, [src]);

  return src;
}
