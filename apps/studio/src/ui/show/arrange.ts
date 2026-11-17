// "Anordnen" on the preview monitor: whether the layout editor is open, which layer is selected, and the
// scene being dragged right now. The draft is drawn by the preview monitor every frame and committed to the
// show state only on release, so a drag never floods the reducer, the saved show or the program picture.

import { useSyncExternalStore } from 'react';
import type { Scene } from '../../state/types';

type ArrangeState = { on: boolean; selected: string | null };

let state: ArrangeState = { on: false, selected: null };
let draft: Scene | null = null;
const listeners = new Set<() => void>();

function set(next: Partial<ArrangeState>) {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

export const arrange = {
  get: () => state,
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  open: (selected: string | null = null) => set({ on: true, selected }),
  close: () => {
    draft = null;
    set({ on: false, selected: null });
  },
  toggle: () => (state.on ? arrange.close() : arrange.open()),
  select: (selected: string | null) => set({ selected }),
  /** The scene as it looks mid-drag (null = draw the show state). */
  draft: () => draft,
  setDraft: (scene: Scene | null) => {
    draft = scene;
  },
};

export function useArrange(): ArrangeState {
  return useSyncExternalStore(arrange.subscribe, arrange.get);
}
