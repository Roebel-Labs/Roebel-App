// Show-tab keyboard shortcuts. Pure: maps a key event onto a reducer action.
// Going on air is deliberately never bound to a key (button + confirm only).

import type { Action } from '../state/reducer';
import type { ShowState, Template } from '../state/types';

export type HotkeyEvent = { key: string; code: string; target: 'input' | 'other'; shift: boolean };

function firstOverlayOfKind(state: ShowState, kind: Template['kind']): string | null {
  for (const o of state.overlays) {
    const t = state.templates.find((x) => x.id === o.templateId);
    if (t?.kind === kind) return o.id;
  }
  return null;
}

function digitOf(code: string): number | null {
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(code);
  return m ? Number(m[1]) : null;
}

export function hotkeyAction(e: HotkeyEvent, state: ShowState, now: number = Date.now()): Action | 'goLive' | null {
  if (e.target === 'input') return null;
  // Modified keys stay unbound (Shift+Enter must never start anything).
  if (e.shift) return null;

  if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') return { type: 'take', now };

  const digit = digitOf(e.code);
  if (digit !== null) {
    const scene = state.scenes[digit - 1];
    return scene ? { type: 'setPreview', sceneId: scene.id } : null;
  }

  switch (e.code) {
    case 'KeyC':
      return { type: 'cut' };
    case 'KeyN':
      return { type: 'nextRow' };
    case 'KeyL': {
      const id = firstOverlayOfKind(state, 'lowerThird');
      return id ? { type: 'toggleOverlay', id, now } : null;
    }
    case 'KeyB': {
      const id = firstOverlayOfKind(state, 'logoBug');
      return id ? { type: 'toggleOverlay', id, now } : null;
    }
  }
  return null;
}

/** Classifies a DOM event target for hotkeyAction. */
export function targetKind(t: EventTarget | null): 'input' | 'other' {
  if (!(t instanceof HTMLElement)) return 'other';
  if (t.isContentEditable) return 'input';
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ? 'input' : 'other';
}
