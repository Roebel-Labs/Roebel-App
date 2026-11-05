import { describe, expect, it } from 'vitest';
import { initialState, restore, serialize, showReducer } from '../reducer';
import type { ShowState } from '../types';
import { STARTER_TEMPLATES } from '../../render/templates';
import { overlayProgress } from '../../render/anim';

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
    expect(s.overlays[0].fromProgress).toBeUndefined(); // unknown template → plain restart
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
    expect(s.templates).toEqual(STARTER_TEMPLATES);
    expect(s.overlays).toEqual(
      STARTER_TEMPLATES.map((t) => ({ id: `ov-${t.id}`, templateId: t.id, visible: false, changedAt: 0, fromProgress: 0 })),
    );
  });

  it('ships the seven starter kinds as deep copies', () => {
    const s = initialState();
    expect(s.templates.map((t) => t.kind)).toEqual(['lowerThird', 'logoBug', 'clock', 'nextUp', 'breakSpot', 'pause', 'donation']);
    s.templates[0].nodes[0].x = 9999;
    expect(STARTER_TEMPLATES[0].nodes[0].x).not.toBe(9999);
    expect(initialState().templates[0].nodes[0].x).not.toBe(9999);
  });
});

describe('overlay re-toggle', () => {
  it('show at 0, hide at 200 (fade 400) records fromProgress 0.5 and fades out from there', () => {
    let s = initialState();
    const id = 'ov-clock'; // clock: fade 400 in
    s = showReducer(s, { type: 'setOverlay', id, visible: true, now: 0 });
    s = showReducer(s, { type: 'setOverlay', id, visible: false, now: 200 });
    const o = s.overlays.find((x) => x.id === id)!;
    expect(o.fromProgress).toBeCloseTo(0.5, 10);
    const t = s.templates.find((x) => x.id === o.templateId)!;
    expect(overlayProgress(o, t.animOut, 200)).toBeCloseTo(0.5, 10);
    const later = overlayProgress(o, t.animOut, 300);
    expect(later).toBeLessThan(0.5);
    expect(overlayProgress(o, t.animOut, 400)).toBe(0);
  });

  it('setOverlay to the current visibility does not restart the animation', () => {
    let s = initialState();
    s = showReducer(s, { type: 'setOverlay', id: 'ov-clock', visible: true, now: 0 });
    s = showReducer(s, { type: 'setOverlay', id: 'ov-clock', visible: true, now: 5000 });
    const o = s.overlays.find((x) => x.id === 'ov-clock')!;
    expect(o.fromProgress).toBe(1);
    expect(overlayProgress(o, s.templates.find((t) => t.id === 'clock')!.animIn, 5000)).toBe(1);
  });
});

describe('addOverlay / removeOverlay', () => {
  it('adds a hidden instance of an existing template', () => {
    const s0 = initialState();
    const t = s0.templates[0].id;
    let s = showReducer(s0, { type: 'addOverlay', templateId: t, id: 'mine' });
    expect(s.overlays.at(-1)).toEqual({ id: 'mine', templateId: t, visible: false, changedAt: 0, fromProgress: 0 });
    s = showReducer(s, { type: 'addOverlay', templateId: t });
    expect(s.overlays).toHaveLength(s0.overlays.length + 2);
    expect(typeof s.overlays.at(-1)!.id).toBe('string');
    expect(s.overlays.at(-1)!.id).not.toBe('mine');
  });

  it('ignores unknown templates and duplicate ids', () => {
    const s0 = initialState();
    expect(showReducer(s0, { type: 'addOverlay', templateId: 'nope' })).toBe(s0);
    expect(showReducer(s0, { type: 'addOverlay', templateId: s0.templates[0].id, id: s0.overlays[0].id })).toBe(s0);
  });

  it('removes by id', () => {
    const s0 = initialState();
    const s = showReducer(s0, { type: 'removeOverlay', id: s0.overlays[0].id });
    expect(s.overlays.map((o) => o.id)).toEqual(s0.overlays.slice(1).map((o) => o.id));
    expect(showReducer(s0, { type: 'removeOverlay', id: 'nope' }).overlays).toEqual(s0.overlays);
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
    expect(r).toEqual({ ...s, transition: { ...s.transition, startedAt: null, fromSceneId: null } });
    expect(r.overlays[0].visible).toBe(true);
  });

  it('keeps deliberately emptied templates/overlays but seeds starters when the fields are absent', () => {
    const emptied = restore(JSON.stringify({ ...initialState(), templates: [], overlays: [] }));
    expect(emptied.templates).toEqual([]);
    expect(emptied.overlays).toEqual([]);
    const o: Record<string, unknown> = JSON.parse(serialize(initialState()));
    delete o.templates;
    delete o.overlays;
    const seeded = restore(JSON.stringify(o));
    expect(seeded.templates).toEqual(initialState().templates);
    expect(seeded.overlays).toEqual(initialState().overlays);
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

  it('drops malformed array elements and coerces nested fields', () => {
    const r = restore(
      JSON.stringify({
        version: 1,
        sources: [null, 5, { id: 3 }, { id: 's', kind: 'color', label: 'x' }],
        scenes: [{}, null, { id: 'sc', label: 'a', layout: 'full', sourceIds: 'bad' }],
        overlays: ['x', { id: 'o', templateId: 't', visible: true, changedAt: 1 }],
        templates: [null, { id: 't', name: 'n', kind: 'custom', fullScreen: false, nodes: 'bad', animIn: 7 }],
        presets: [null],
      }),
    );
    expect(r.sources.map((x) => x.id)).toEqual(['s']);
    expect(r.scenes).toHaveLength(1);
    expect(r.scenes[0].sourceIds).toEqual([]);
    expect(r.overlays).toHaveLength(1);
    expect(r.templates[0].nodes).toEqual([]);
    expect(r.templates[0].animIn.kind).toBe('none');
    expect(r.presets).toEqual(initialState().presets);
    expect(() => showReducer(r, { type: 'removeSource', id: 's' })).not.toThrow();
  });

  it('nulls dangling ids and falls back to the default preset', () => {
    const r = restore(
      JSON.stringify({
        version: 1,
        scenes: [{ id: 'a', label: 'a', layout: 'full', sourceIds: [] }],
        previewSceneId: 'a',
        programSceneId: 'ghost',
        transition: { presetId: 'ghost', startedAt: 5, fromSceneId: 'a' },
        table: { columns: [], rows: [{ id: 'r', values: {} }], currentRowId: 'ghost' },
      }),
    );
    expect(r.previewSceneId).toBe('a');
    expect(r.programSceneId).toBeNull();
    expect(r.transition).toEqual({ presetId: 'preset-fade', startedAt: null, fromSceneId: null });
    expect(r.table.currentRowId).toBeNull();
  });
});

describe('switcher edge cases', () => {
  it('take/cut are no-ops when preview equals program or preview is null', () => {
    let s = withScenes();
    const a = s.scenes[0].id;
    const same = { ...s, previewSceneId: a, programSceneId: a };
    expect(showReducer(same, { type: 'take', now: 1 })).toBe(same);
    expect(showReducer(same, { type: 'cut' })).toBe(same);
    s = { ...s, previewSceneId: null, programSceneId: a };
    expect(showReducer(s, { type: 'take', now: 1 })).toBe(s);
  });

  it('take with null program is an instant cut', () => {
    let s = withScenes();
    s = { ...s, previewSceneId: s.scenes[0].id, programSceneId: null };
    s = showReducer(s, { type: 'take', now: 1 });
    expect(s.programSceneId).toBe(s.scenes[0].id);
    expect(s.transition.startedAt).toBeNull();
    expect(s.transition.fromSceneId).toBeNull();
  });

  it('removeScene of the transition source clears the running transition', () => {
    let s = withScenes();
    const [a, b] = s.scenes.map((x) => x.id);
    s = showReducer({ ...s, previewSceneId: a, programSceneId: b }, { type: 'take', now: 1 });
    s = showReducer(s, { type: 'removeScene', id: b });
    expect(s.transition.startedAt).toBeNull();
    expect(s.transition.fromSceneId).toBeNull();
  });

  it('setPreview and selectRow ignore unknown ids', () => {
    let s = showReducer(initialState(), { type: 'addRow' });
    expect(showReducer(s, { type: 'setPreview', sceneId: 'ghost' })).toBe(s);
    expect(showReducer(s, { type: 'selectRow', rowId: 'ghost' })).toBe(s);
  });

  it('nextRow with no current row selects row 0', () => {
    let s = showReducer(initialState(), { type: 'addRow' });
    s = showReducer(s, { type: 'addRow' });
    s = showReducer(s, { type: 'selectRow', rowId: null });
    s = showReducer(s, { type: 'nextRow' });
    expect(s.table.currentRowId).toBe(s.table.rows[0].id);
  });
});

describe('table structure actions', () => {
  const mk = () => {
    let s = initialState();
    s = showReducer(s, { type: 'setTable', table: { columns: ['A', 'B'], rows: [], currentRowId: null } });
    s = showReducer(s, { type: 'addRow', values: { A: '1', B: 'x' } });
    s = showReducer(s, { type: 'addRow', values: { A: '2', B: 'y' } });
    s = showReducer(s, { type: 'addRow', values: { A: '3', B: 'z' } });
    return s;
  };
  it('addColumn appends once, ignores blank or duplicate names', () => {
    let s = showReducer(mk(), { type: 'addColumn', name: 'C' });
    expect(s.table.columns).toEqual(['A', 'B', 'C']);
    s = showReducer(s, { type: 'addColumn', name: 'C' });
    s = showReducer(s, { type: 'addColumn', name: '  ' });
    expect(s.table.columns).toEqual(['A', 'B', 'C']);
  });
  it('renameColumn moves values and rejects collisions', () => {
    let s = showReducer(mk(), { type: 'renameColumn', from: 'A', to: 'Gruppe' });
    expect(s.table.columns).toEqual(['Gruppe', 'B']);
    expect(s.table.rows[0].values).toEqual({ Gruppe: '1', B: 'x' });
    const same = showReducer(s, { type: 'renameColumn', from: 'Gruppe', to: 'B' });
    expect(same).toBe(s);
  });
  it('removeColumn drops the column and its values', () => {
    const s = showReducer(mk(), { type: 'removeColumn', name: 'B' });
    expect(s.table.columns).toEqual(['A']);
    expect(s.table.rows[1].values).toEqual({ A: '2' });
  });
  it('moveRow shifts by delta and clamps at the ends', () => {
    const s = mk();
    const [r1, r2, r3] = s.table.rows.map((r) => r.id);
    expect(showReducer(s, { type: 'moveRow', rowId: r3, delta: -1 }).table.rows.map((r) => r.id)).toEqual([r1, r3, r2]);
    expect(showReducer(s, { type: 'moveRow', rowId: r1, delta: -1 })).toBe(s);
    expect(showReducer(s, { type: 'moveRow', rowId: r3, delta: 1 })).toBe(s);
  });
  it('renameColumn rewrites row/next bindings in templates', () => {
    let s = mk();
    s = showReducer(s, { type: 'renameColumn', from: 'A', to: 'Gruppe' });
    const s2 = showReducer(
      { ...s, templates: [{ ...s.templates[0], nodes: [{ id: 'n', type: 'text', x: 0, y: 0, w: 1, h: 1, text: '{{row.Gruppe}} / {{ next.Gruppe }} / {{row.Other}}' }] }] },
      { type: 'renameColumn', from: 'Gruppe', to: 'Tanzgruppe' },
    );
    expect(s2.templates[0].nodes[0].text).toBe('{{row.Tanzgruppe}} / {{ next.Tanzgruppe }} / {{row.Other}}');
  });
});

describe('audio', () => {
  const ch = { id: 'a1', label: 'Mic', input: { kind: 'device' as const, deviceId: 'd1' }, gainDb: 0, muted: false, delayMs: 0 };

  it('defaults to no channels and 0 dB master', () => {
    expect(initialState().audio).toEqual({ channels: [], masterDb: 0 });
    expect(restore(null).audio).toEqual({ channels: [], masterDb: 0 });
  });

  it('adds, patches and removes channels; ignores duplicate ids', () => {
    let s = showReducer(initialState(), { type: 'addAudioChannel', channel: ch });
    s = showReducer(s, { type: 'addAudioChannel', channel: ch });
    expect(s.audio.channels).toHaveLength(1);
    s = showReducer(s, { type: 'updateAudioChannel', id: 'a1', patch: { gainDb: -6, muted: true } });
    expect(s.audio.channels[0]).toMatchObject({ gainDb: -6, muted: true, delayMs: 0 });
    s = showReducer(s, { type: 'removeAudioChannel', id: 'a1' });
    expect(s.audio.channels).toEqual([]);
  });

  it('addAudioChannel generates an id when none is given', () => {
    const { id: _id, ...rest } = ch;
    const s = showReducer(initialState(), { type: 'addAudioChannel', channel: rest });
    expect(s.audio.channels[0].id).toBeTruthy();
  });

  it('setMasterDb stores the value', () => {
    expect(showReducer(initialState(), { type: 'setMasterDb', db: -3 }).audio.masterDb).toBe(-3);
  });

  it('restore round-trips channels and validates each element', () => {
    let s = showReducer(initialState(), { type: 'addAudioChannel', channel: { ...ch, followsVideoSourceId: 'cam1', delayMs: 120 } });
    s = showReducer(s, { type: 'setMasterDb', db: -2 });
    expect(restore(serialize(s)).audio).toEqual(s.audio);
    const raw = JSON.parse(serialize(s));
    raw.audio.channels.push({ id: 'bad', input: { kind: 'nope' } }, 'x', { id: 'b2', input: { kind: 'source', sourceId: 's' }, gainDb: 'loud', delayMs: 9999 });
    raw.audio.masterDb = 'x';
    const r = restore(JSON.stringify(raw)).audio;
    expect(r.masterDb).toBe(0);
    expect(r.channels.map((c) => c.id)).toEqual(['a1', 'b2']);
    expect(r.channels[1]).toMatchObject({ gainDb: 0, muted: false, delayMs: 500, label: '' });
  });

  it('restore of a state saved before audio existed gets the default', () => {
    const raw = JSON.parse(serialize(initialState()));
    delete raw.audio;
    expect(restore(JSON.stringify(raw)).audio).toEqual({ channels: [], masterDb: 0 });
  });
});
