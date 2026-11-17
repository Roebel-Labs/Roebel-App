// The app icon follows the main assistant (like the reference app): Dock on macOS, taskbar on Windows. The
// renderer draws the PNG (a character from its bundled figure, an own picture or Mecky's tile from the web);
// the shell (installer ≥ 0.3.9) applies it. Anything that cannot be drawn (offline, a picture without CORS, an
// older bot with only an initial) keeps the bundled Ortis icon. Older shells have no setAppIcon and simply keep
// their icon. Nothing here ever throws.
import { useEffect } from 'react';
import { API_BASE } from '../live-room/config';
import { isMecky } from '../workspace/BotAvatar';
import type { Agent } from '../workspace/api';
import { MECKY_COLOR, agentPicture } from './characters';

const SIZE = 1024;

type IconSpec =
  /** A transparent figure on its colour, head and upper body. */
  | { key: string; src: string; color: string; fit: 'figure'; remote: false }
  /** A square picture (own upload, Mecky's tile) filling the icon. */
  | { key: string; src: string; color: string; fit: 'cover'; remote: boolean };

type IconAgent = Pick<Agent, 'botId' | 'defaultName'> & Partial<Pick<Agent, 'characterId' | 'imageUrl' | 'isPreset'>>;

/** What the icon shows for the main assistant, or null for the Ortis icon. */
export function iconSpec(agent: IconAgent | null | undefined): IconSpec | null {
  if (!agent) return null;
  const pic = agentPicture({ imageUrl: agent.imageUrl, characterId: agent.characterId, mecky: (agent.isPreset ?? true) && isMecky({ id: agent.botId, name: agent.defaultName }) });
  switch (pic.kind) {
    case 'character':
      return { key: `c:${pic.character.id}`, src: pic.character.figure, color: pic.character.color, fit: 'figure', remote: false };
    case 'image':
      return { key: `i:${pic.url}`, src: pic.url, color: '#ffffff', fit: 'cover', remote: true };
    case 'mecky':
      // The bundled Mecky is 192 px, too small for a 1024 px icon: the site's tile, or the Ortis icon.
      return { key: 'mecky', src: `${API_BASE}/agents/mecky/tile.webp`, color: MECKY_COLOR, fit: 'cover', remote: true };
    default:
      return null;
  }
}

/** macOS icon grid: an 824 px rounded square centred in 1024 (Windows uses the full square). */
async function drawIcon(spec: IconSpec, mac: boolean): Promise<string | null> {
  try {
    const img = new Image();
    // Remote pictures must allow CORS, or the canvas is tainted and cannot be exported.
    if (spec.remote) img.crossOrigin = 'anonymous';
    img.src = spec.src;
    await img.decode();
    if (!img.naturalWidth || !img.naturalHeight) return null;
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const inset = mac ? 100 : 0;
    const side = SIZE - inset * 2;
    ctx.beginPath();
    ctx.roundRect(inset, inset, side, side, mac ? 185 : 0);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = spec.color;
    ctx.fillRect(inset, inset, side, side);
    ctx.imageSmoothingQuality = 'high';
    if (spec.fit === 'figure') {
      // Head and upper body: the figure a little wider than the tile, anchored near the top, cut off below.
      const w = side * 0.96;
      const h = (img.naturalHeight / img.naturalWidth) * w;
      ctx.drawImage(img, inset + (side - w) / 2, inset + side * 0.08, w, h);
    } else {
      // Cover: the centred square of the picture.
      const s = Math.min(img.naturalWidth, img.naturalHeight);
      ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, inset, inset, side, side);
    }
    ctx.restore();
    return canvas.toDataURL('image/png');
  } catch {
    // Load failure, decode failure or a tainted canvas (SecurityError).
    return null;
  }
}

let applied: string | null | undefined;

export async function applyAppIcon(agent: IconAgent | null | undefined): Promise<void> {
  try {
    const set = window.studio?.desktop?.setAppIcon;
    if (!set) return;
    const spec = iconSpec(agent);
    const key = spec?.key ?? null;
    if (key === applied) return;
    applied = key;
    const url = spec ? await drawIcon(spec, window.studio?.ui?.platform === 'darwin') : null;
    if (applied !== key) return;
    await set(url).catch(() => false);
  } catch {
    // Never let the icon break the app.
  }
}

/** Keeps the app icon on the main assistant's picture. */
export function useAgentAppIcon(agent: IconAgent | null | undefined, ready: boolean): void {
  const key = iconSpec(agent)?.key ?? null;
  useEffect(() => {
    if (ready) void applyAppIcon(agent);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the picture key is what matters, not the object
  }, [key, ready]);
}
