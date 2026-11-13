// The app icon follows the main assistant (like the reference app): Dock on macOS, taskbar on Windows. The
// renderer draws the PNG from the bundled figure; the shell (installer ≥ 0.3.9) applies it. Mecky = the
// bundled Ortis icon. Older shells have no setAppIcon and simply keep their icon.
import { useEffect } from 'react';
import { characterById, type Character } from './characters';

const SIZE = 1024;

/** macOS icon grid: an 824 px rounded square centred in 1024 (Windows uses the full square). */
async function drawIcon(c: Character, mac: boolean): Promise<string | null> {
  const img = new Image();
  img.src = c.figure;
  try {
    await img.decode();
  } catch {
    return null;
  }
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
  ctx.fillStyle = c.color;
  ctx.fillRect(inset, inset, side, side);
  // Head and upper body: the figure a little wider than the tile, anchored near the top, cut off below.
  const w = side * 0.96;
  const h = (img.naturalHeight / img.naturalWidth) * w;
  ctx.drawImage(img, inset + (side - w) / 2, inset + side * 0.08, w, h);
  ctx.restore();
  return canvas.toDataURL('image/png');
}

let applied: string | null | undefined;

export async function applyAppIcon(characterId: string | null | undefined): Promise<void> {
  const set = window.studio?.desktop?.setAppIcon;
  if (!set) return;
  const id = characterById(characterId)?.id ?? null;
  if (id === applied) return;
  applied = id;
  const c = characterById(id);
  if (!c) {
    await set(null).catch(() => false);
    return;
  }
  const url = await drawIcon(c, window.studio?.ui?.platform === 'darwin');
  if (url && applied === id) await set(url).catch(() => false);
}

/** Keeps the app icon on the main assistant's character. */
export function useAgentAppIcon(characterId: string | null | undefined, ready: boolean): void {
  useEffect(() => {
    if (ready) void applyAppIcon(characterId);
  }, [characterId, ready]);
}
