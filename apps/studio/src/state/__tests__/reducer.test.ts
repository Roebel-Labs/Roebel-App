import { describe, expect, it } from 'vitest';
import { initialState, restore, serialize, showReducer } from '../reducer';
import type { ShowState } from '../types';

function withScenes(): ShowState {
  let s = initialState();
  s = showReducer(s, { type: 'addSource', source: { kind: 'camera', label: 'A' } });
  s = showReducer(s, { type: 'addSource', source: { kind: 'camera', label: 'B' } });
  return s;
}

describe('showReducer', () => {
  it('addSource camera also creates a full scene', () => {
    const s = showReducer(initialState(), { type: 'addSource', source: { kind: 'camera', label: 'Cam 1' } });
    expect(s.sources).toHaveLength(1);
    expect(s.scenes).toHaveLength(1);
    expect(s.scenes[0]).toMatchObject({ layout: 'full', sourceIds: [s.sources[0].id], label: 'Cam 1' });
  });

  it('take swaps preview and program and starts the transition', () => {
    let s = withScenes();
    const [a, b] = s.scenes.map((x) => x.id);
    s = { ...s, previewSceneId: a, programSceneId: b };
    s = showReducer(s, { type: 'take', now: 1000 });
    expect(s.programSceneId).toBe(a);
    expect(s.previewSceneId).toBe(b);
    expect(s.transition.fromSceneId).toBe(b);
    expect(s.transition.startedAt).toBe(1000);
  });

  it('take while a transition runs is ignored', () => {
    let s = withScenes();
    const [a, b] = s.scenes.map((x) => x.id);
    s = showReducer({ ...s, previewSceneId: a, programSceneId: b }, { type: 'take', now: 1000 });
    expect(showReducer(s, { type: 'take', now: 1100 })).toBe(s);
  });

  it('take with the cut preset leaves startedAt null', () => {
    let s = withScenes();
    const [a, b] = s.scenes.map((x) => x.id);
    s = { ...s, previewSceneId: a, programSceneId: b };
    s = showReducer(s, { type: 'setPreset', presetId: 'preset-cut' });
    s = showReducer(s, { type: 'take', now: 5 });
    expect(s.programSceneId).toBe(a);
    expect(s.transition.startedAt).toBeNull();
  });

  it('transitionDone clears the running transition', () => {
    let s = withScenes();
    const [a, b] = s.scenes.map((x) => x.id);
    s = showReducer({ ...s, previewSceneId: a, programSceneId: b }, { type: 'take', now: 1 });
    s = showReducer(s, { type: 'transitionDone' });
    expect(s.transition.startedAt).toBeNull();
    expect(s.transition.fromSceneId).toBeNull();
  });

  it('nextRow advances and stays on the last row', () => {
    let s = initialState();
    s = showReducer(s, { type: 'addRow' });
    s = showReducer(s, { type: 'addRow' });
    const [r1, r2] = s.table.rows.map((r) => r.id);
    s = showReducer(s, { type: 'selectRow', rowId: r1 });
    s = showReducer(s, { type: 'nextRow' });
    expect(s.table.currentRowId).toBe(r2);
    s = showReducer(s, { type: 'nextRow' });
    expect(s.table.currentRowId).toBe(r2);
  });

  it('removeSource of the program source clears program and its scenes', () => {
    let s = withScenes();
    const [a, b] = s.scenes.map((x) => x.id);
    s = { ...s, previewSceneId: a, programSceneId: b };
    s = showReducer(s, { type: 'removeSource', id: s.sources[1].id });
    expect(s.programSceneId).toBeNull();
    expect(s.previewSceneId).toBe(a);
    expect(s.scenes.map((x) => x.id)).toEqual([a]);
  });

  it('updateSettings merges partially', () => {
    const s = showReducer(initialState(), { type: 'updateSettings', patch: { fps: 50 } });
    expect(s.settings.fps).toBe(50);
    expect(s.settings.videoKbps).toBe(6000);
  });

  it('toggleOverlay and setOverlay record changedAt', () => {
    let s = initialState();
    s = { ...s, overlays: [{ id: 'o1', templateId: 't', visible: false, changedAt: 0 }] };
    s = showReducer(s, { type: 'toggleOverlay', id: 'o1', now: 7 });
    expect(s.overlays[0]).toMatchObject({ visible: true, changedAt: 7 });
    s = showReducer(s, { type: 'setOverlay', id: 'o1', visible: false, now: 9 });
    expect(s.overlays[0]).toMatchObject({ visible: false, changedAt: 9 });
  });
});

describe('initialState', () => {
  it('has the fixed defaults', () => {
    const s = initialState();
    expect(s.settings.ffmpegPath).toBe('/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg');
    expect(s.presets.map((p) => p.id)).toEqual(['preset-cut', 'preset-fade', 'preset-wipe', 'preset-slide', 'preset-zoom']);
    expect(s.transition.presetId).toBe('preset-fade');
    expect(s.templates).toEqual([]);
    expect(s.overlays).toEqual([]);
  });
});

describe('serialize / restore', () => {
  it('garbage and null give initialState', () => {
    expect(restore('garbage')).toEqual(initialState());
    expect(restore(null)).toEqual(initialState());
  });

  it('round-trips, resetting transition.startedAt and keeping overlay visibility', () => {
    let s = withScenes();
    const [a, b] = s.scenes.map((x) => x.id);
    s = showReducer({ ...s, previewSceneId: a, programSceneId: b }, { type: 'take', now: 1 });
    s = { ...s, overlays: [{ id: 'o1', templateId: 't', visible: true, changedAt: 3 }] };
    s = showReducer(s, { type: 'addRow' });
    const r = restore(serialize(s));
    expect(r).toEqual({ ...s, transition: { ...s.transition, startedAt: null } });
    expect(r.overlays[0].visible).toBe(true);
  });

  it('fills defaults for missing newer fields', () => {
    const o: Record<string, unknown> = JSON.parse(serialize(initialState()));
    delete o.sponsors;
    delete (o.settings as Record<string, unknown>).videoKbps;
    const r = restore(JSON.stringify(o));
    expect(r.sponsors).toEqual(initialState().sponsors);
    expect(r.settings.videoKbps).toBe(6000);
  });

  it('falls back to defaults for wrong-typed fields', () => {
    const r = restore(JSON.stringify({ version: 1, sources: 'x', settings: 5, table: [] }));
    expect(r.sources).toEqual([]);
    expect(r.settings).toEqual(initialState().settings);
    expect(r.table).toEqual(initialState().table);
  });

  it('keeps stored values over defaults', () => {
    const base = initialState();
    const r = restore(JSON.stringify({ ...base, settings: { ...base.settings, fps: 50, target: { kind: 'srt', url: 'srt://x' } } }));
    expect(r.settings.fps).toBe(50);
    expect(r.settings.target).toEqual({ kind: 'srt', url: 'srt://x' });
  });
});
