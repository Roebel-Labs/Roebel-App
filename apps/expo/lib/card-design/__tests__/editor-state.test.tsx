import * as React from 'react';
import renderer, { act } from 'react-test-renderer';
import { TEMPLATES, updateLayer, type CardDesign } from '@roebel/card-design';
import {
  HISTORY_CAP, MIN_LAYER, editorReducer, initialEditorState, pinchLayer, useAutosave,
  type EditorAction, type EditorState,
} from '../editor-state';

const base = TEMPLATES[0].design;
const rename = (text: string) => (d: CardDesign) => updateLayer(d, 'title', { text });
const titleOf = (s: EditorState) => (s.design.layers.find((l) => l.id === 'title') as { text: string }).text;
const run = (s: EditorState, ...as: EditorAction[]) => as.reduce(editorReducer, s);

describe('editorReducer', () => {
  it('undo after two applies restores the first design, redo brings the second back', () => {
    const s = run(initialEditorState(base), { type: 'apply', fn: rename('A') }, { type: 'apply', fn: rename('B') });
    const u = editorReducer(s, { type: 'undo' });
    expect(titleOf(u)).toBe('A');
    expect(titleOf(editorReducer(u, { type: 'redo' }))).toBe('B');
  });

  it('a new apply clears redo', () => {
    const s = run(initialEditorState(base), { type: 'apply', fn: rename('A') }, { type: 'undo' }, { type: 'apply', fn: rename('C') });
    expect(s.future).toHaveLength(0);
    expect(editorReducer(s, { type: 'redo' })).toBe(s);
  });

  it('caps the history at 100', () => {
    let s = initialEditorState(base);
    for (let i = 0; i < HISTORY_CAP + 20; i++) s = editorReducer(s, { type: 'apply', fn: rename(`T${i}`) });
    expect(s.past).toHaveLength(HISTORY_CAP);
  });

  it('a gesture is one history step', () => {
    let s = run(initialEditorState(base), { type: 'gestureStart' });
    for (let i = 1; i <= 30; i++) s = editorReducer(s, { type: 'gestureMove', fn: (d) => updateLayer(d, 'title', { x: 52 + i }) });
    s = editorReducer(s, { type: 'gestureEnd' });
    expect(s.past).toHaveLength(1);
    expect(editorReducer(s, { type: 'undo' }).design).toBe(base);
  });

  it('saved keeps dirty when the design changed while saving', () => {
    const s = run(initialEditorState(base), { type: 'apply', fn: rename('A') });
    const sentDesign = s.design;
    const changed = editorReducer(s, { type: 'apply', fn: rename('B') });
    expect(editorReducer(changed, { type: 'saved', revision: 2, design: sentDesign })).toMatchObject({ dirty: true, revision: 2 });
    expect(editorReducer(s, { type: 'saved', revision: 2, design: sentDesign })).toMatchObject({ dirty: false, revision: 2 });
  });

  it('conflict: keep mine takes the server revision, load theirs replaces the design', () => {
    const server = { id: 'd', revision: 9, design: TEMPLATES[1].design } as any;
    const s = run(initialEditorState(base, 3), { type: 'apply', fn: rename('A') }, { type: 'conflict', server });
    expect(s.conflict).toBe(server);
    const mine = editorReducer(s, { type: 'keepMine' });
    expect(mine).toMatchObject({ revision: 9, conflict: null, dirty: true });
    expect(titleOf(mine)).toBe('A');
    const theirs = editorReducer(s, { type: 'replace', design: server.design, revision: 9 });
    expect(theirs).toMatchObject({ design: server.design, revision: 9, dirty: false, conflict: null, past: [] });
  });
});

describe('pinch', () => {
  const layer = { ...(base.layers.find((l) => l.id === 'title') as any), w: 100, h: 40, x: 0, y: 0, rotation: 0 };

  it('never goes below 24 units', () => {
    const p = pinchLayer(layer, 0.01, 0);
    expect(Math.min(p.w, p.h)).toBeCloseTo(MIN_LAYER);
    expect(p.w / p.h).toBeCloseTo(100 / 40);
    // Kept centred.
    expect(p.x + p.w / 2).toBeCloseTo(50);
  });

  it('a layer already below the minimum can grow but not shrink', () => {
    const tiny = { ...layer, w: 30, h: 10 };
    expect(pinchLayer(tiny, 0.5, 0)).toMatchObject({ w: 30, h: 10 });
    expect(pinchLayer(tiny, 2, 0).w).toBe(60);
  });

  it('rotates and wraps to -180..180', () => {
    expect(pinchLayer({ ...layer, rotation: 170 }, 1, 30).rotation).toBe(-160);
  });

  it('the pinch action works on the gesture base, so scales do not compound', () => {
    let s = run(initialEditorState(updateLayer(base, 'title', { w: 100, h: 40 })), { type: 'gestureStart' });
    s = editorReducer(s, { type: 'pinch', id: 'title', scale: 0.5, rotation: 0 });
    s = editorReducer(s, { type: 'pinch', id: 'title', scale: 0.5, rotation: 0 });
    const t = s.design.layers.find((l) => l.id === 'title')!;
    expect(t.w).toBe(60); // 0.5 would give 50x20 → clamped so h = 24
    expect(t.h).toBe(24);
  });
});

describe('useAutosave', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function Harness({ save, onState }: { save: any; onState: (s: EditorState, d: (a: EditorAction) => void) => void }) {
    const [s, d] = React.useReducer(editorReducer, initialEditorState(base, 5));
    useAutosave(s, d, save);
    onState(s, d);
    return null;
  }

  it('fires once 2 s after the last of several rapid changes, with baseRevision', async () => {
    const save = jest.fn(async (design: CardDesign) => ({ ok: true, data: { revision: 6, design } }));
    let dispatch!: (a: EditorAction) => void;
    let state!: EditorState;
    act(() => {
      renderer.create(<Harness save={save} onState={(s, d) => { state = s; dispatch = d; }} />);
    });
    for (const t of ['A', 'B', 'C']) {
      act(() => dispatch({ type: 'apply', fn: rename(t) }));
      act(() => { jest.advanceTimersByTime(500); });
    }
    expect(save).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(2000); });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][1]).toBe(5);
    expect(titleOf({ design: save.mock.calls[0][0] } as EditorState)).toBe('C');
    expect(state).toMatchObject({ dirty: false, revision: 6 });
  });

  it('a 409 result yields the conflict state holding the server draft', async () => {
    const server = { id: 'd', revision: 8, design: TEMPLATES[1].design };
    const save = jest.fn(async () => ({ ok: false, code: 'DRAFT_CONFLICT', message: 'x', data: server }));
    let dispatch!: (a: EditorAction) => void;
    let state!: EditorState;
    act(() => {
      renderer.create(<Harness save={save} onState={(s, d) => { state = s; dispatch = d; }} />);
    });
    act(() => dispatch({ type: 'apply', fn: rename('A') }));
    await act(async () => { jest.advanceTimersByTime(2000); });
    expect(state.conflict).toEqual(server);
    expect(state.dirty).toBe(true);
  });
});
