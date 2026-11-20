// The touch editor's state: same contract as Studio's designer/state.ts (D3) — select, apply,
// undo, redo, saved, replace, history capped at 100, autosave 2 s after the last change — plus
// gestures: a gesture shows its changes live and lands in the history as ONE step when it ends,
// and pinch never makes a layer smaller than 24 card units.
import { useCallback, useEffect, useRef, useState } from 'react';
import { designSize, updateLayer, type CardDesign, type Layer } from '@roebel/card-design';
import type { DesignResult, DraftWithDesign } from '@/lib/credreg/designs';

export const HISTORY_CAP = 100;
/** Smallest layer side (card units) a pinch may produce. */
export const MIN_LAYER = 24;

export type EditorState = {
  design: CardDesign;
  selected: string | null;
  past: CardDesign[];
  future: CardDesign[];
  dirty: boolean;
  /** The server revision the design is based on (baseRevision of the next save). */
  revision: number;
  /** The design as it was when the running gesture began (null = no gesture). */
  gestureBase: CardDesign | null;
  /** A 409 DRAFT_CONFLICT: the newer server draft, until the person chooses. */
  conflict: DraftWithDesign | null;
};

export type EditorAction =
  | { type: 'select'; id: string | null }
  | { type: 'apply'; fn: (d: CardDesign) => CardDesign }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'saved'; revision: number; design: CardDesign }
  | { type: 'replace'; design: CardDesign; revision: number }
  | { type: 'conflict'; server: DraftWithDesign }
  /** "Meine Version behalten": keep the local design, save over the server's revision. */
  | { type: 'keepMine' }
  | { type: 'gestureStart' }
  /** Live change during a gesture, computed from the design at gesture start. */
  | { type: 'gestureMove'; fn: (base: CardDesign) => CardDesign }
  | { type: 'gestureEnd' }
  | { type: 'pinch'; id: string; scale: number; rotation: number }
  /** Something saved with the design changed (name, kind): save again, no undo step. */
  | { type: 'touch' };

export function initialEditorState(design: CardDesign, revision = 0): EditorState {
  return { design, selected: null, past: [], future: [], dirty: false, revision, gestureBase: null, conflict: null };
}

const pushPast = (past: CardDesign[], d: CardDesign) => [...past, d].slice(-HISTORY_CAP);

/**
 * `layer` scaled by `scale` about its centre (aspect kept) and rotated by `rotation` degrees.
 * The scale is clamped so neither side drops below MIN_LAYER (a layer already smaller stays as is
 * and can only grow).
 */
export function pinchLayer(layer: Layer, scale: number, rotation: number): Layer {
  const s0 = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const minSide = Math.min(layer.w, layer.h);
  const floor = minSide >= MIN_LAYER ? MIN_LAYER / minSide : 1;
  const s = Math.max(s0, floor);
  const w = layer.w * s, h = layer.h * s;
  const cx = layer.x + layer.w / 2, cy = layer.y + layer.h / 2;
  let rot = (layer.rotation + (Number.isFinite(rotation) ? rotation : 0)) % 360;
  if (rot > 180) rot -= 360;
  if (rot <= -180) rot += 360;
  return { ...layer, x: cx - w / 2, y: cy - h / 2, w, h, rotation: rot };
}

function applyPinch(d: CardDesign, id: string, scale: number, rotation: number): CardDesign {
  const layer = d.layers.find((l) => l.id === id);
  if (!layer) return d;
  const next = pinchLayer(layer, scale, rotation);
  return updateLayer(d, id, { x: next.x, y: next.y, w: next.w, h: next.h, rotation: next.rotation });
}

export function editorReducer(s: EditorState, a: EditorAction): EditorState {
  switch (a.type) {
    case 'select':
      return { ...s, selected: a.id };
    case 'apply': {
      const next = a.fn(s.design);
      if (next === s.design) return s;
      const selected = s.selected && next.layers.some((l) => l.id === s.selected) ? s.selected : null;
      return { ...s, design: next, past: pushPast(s.past, s.design), future: [], dirty: true, selected };
    }
    case 'undo': {
      if (s.past.length === 0) return s;
      const prev = s.past[s.past.length - 1];
      return { ...s, design: prev, past: s.past.slice(0, -1), future: [s.design, ...s.future], dirty: true, gestureBase: null };
    }
    case 'redo': {
      if (s.future.length === 0) return s;
      const [next, ...rest] = s.future;
      return { ...s, design: next, past: pushPast(s.past, s.design), future: rest, dirty: true, gestureBase: null };
    }
    case 'saved':
      // Still dirty if the person changed something while the save was on its way.
      return { ...s, revision: a.revision, dirty: s.design !== a.design };
    case 'replace':
      return initialEditorState(a.design, a.revision);
    case 'conflict':
      return { ...s, conflict: a.server };
    case 'keepMine':
      return s.conflict ? { ...s, revision: s.conflict.revision, conflict: null, dirty: true } : s;
    case 'gestureStart':
      return { ...s, gestureBase: s.design };
    case 'gestureMove':
      return s.gestureBase ? { ...s, design: a.fn(s.gestureBase) } : s;
    case 'gestureEnd': {
      if (!s.gestureBase) return s;
      if (s.design === s.gestureBase) return { ...s, gestureBase: null };
      return { ...s, past: pushPast(s.past, s.gestureBase), future: [], dirty: true, gestureBase: null };
    }
    case 'touch':
      return { ...s, design: { ...s.design }, dirty: true };
    case 'pinch':
      if (s.gestureBase) return { ...s, design: applyPinch(s.gestureBase, a.id, a.scale, a.rotation) };
      return editorReducer(s, { type: 'apply', fn: (d) => applyPinch(d, a.id, a.scale, a.rotation) });
    default:
      return s;
  }
}

/** Layer moved by (dx, dy) card units from its gesture-start position, snapped to edges and centre. */
export function snapTargets(d: CardDesign, exceptId: string | null): { xs: number[]; ys: number[] } {
  const { w, h } = designSize(d.format);
  const xs = [0, w / 2, w], ys = [0, h / 2, h];
  for (const l of d.layers) {
    if (l.id === exceptId) continue;
    xs.push(l.x, l.x + l.w / 2, l.x + l.w);
    ys.push(l.y, l.y + l.h / 2, l.y + l.h);
  }
  return { xs, ys };
}

// ── autosave ─────────────────────────────────────────────────────────────────

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export const AUTOSAVE_MS = 2000;

/**
 * Saves `state.design` `delayMs` after the last change (never during a gesture or an open
 * conflict). `save(design, baseRevision)` returns the server answer: ok → `saved`; 409
 * DRAFT_CONFLICT with the server draft → `conflict`; anything else → status 'error' (the local
 * design stays). `retry()` saves now.
 */
export function useAutosave(
  state: EditorState,
  dispatch: (a: EditorAction) => void,
  save: (design: CardDesign, baseRevision: number) => Promise<DesignResult<DraftWithDesign>>,
  delayMs = AUTOSAVE_MS,
): { status: SaveStatus; error: string | null; retry: () => void; flush: () => Promise<boolean> } {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const saveRef = useRef(save);
  saveRef.current = save;
  const running = useRef(false);

  const pending = useRef<Promise<boolean> | null>(null);
  const run = useCallback(async (): Promise<boolean> => {
    if (pending.current) return pending.current;
    const s = stateRef.current;
    if (!s.dirty) return true;
    if (s.gestureBase || s.conflict) return false;
    const p = save1(s);
    pending.current = p;
    try {
      return await p;
    } finally {
      pending.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  async function save1(s: EditorState): Promise<boolean> {
    running.current = true;
    setStatus('saving');
    const design = s.design;
    const res = await saveRef.current(design, s.revision);
    running.current = false;
    if (res.ok) {
      // Keep the ref current at once: a flush right after must not save the same design again.
      stateRef.current = editorReducer(stateRef.current, { type: 'saved', revision: res.data.revision, design });
      dispatch({ type: 'saved', revision: res.data.revision, design });
      setStatus('saved');
      setError(null);
      return true;
    }
    if (res.code === 'DRAFT_CONFLICT' && res.data) {
      dispatch({ type: 'conflict', server: res.data });
      setStatus('idle');
      return false;
    }
    setStatus('error');
    setError(res.message);
    return false;
  }

  const blocked = !state.dirty || !!state.gestureBase || !!state.conflict;
  useEffect(() => {
    if (blocked) return;
    const t = setTimeout(() => { void run(); }, delayMs);
    return () => clearTimeout(t);
  }, [state.design, state.revision, blocked, delayMs, run]);

  // Leaving the editor: save what is still unsaved.
  useEffect(() => () => { void run(); }, [run]);

  return { status, error, retry: () => { void run(); }, flush: run };
}
