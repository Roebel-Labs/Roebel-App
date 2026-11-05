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
    const dest = { id: 'd1', name: 'YouTube', enabled: false, target: { kind: 'rtmp', url: 'rtmp://a.rtmp.youtube.com/live2', key: 'k' } };
    const r = restore(JSON.stringify({ ...base, settings: { ...base.settings, fps: 50, destinations: [dest] } }));
    expect(r.settings.fps).toBe(50);
    expect(r.settings.destinations).toEqual([dest]);
  });

  it('starts with no destinations (record-only until one is added)', () => {
    expect(initialState().settings.destinations).toEqual([]);
    expect('target' in initialState().settings).toBe(false);
  });

  it("migrates an old single settings.target into one destination named 'Cloudflare'", () => {
    const base = initialState();
    const old = { ...base.settings, destinations: undefined, target: { kind: 'srt', url: 'srt://live.cloudflare.com:778?streamid=s' } };
    const r = restore(JSON.stringify({ ...base, settings: old }));
    expect(r.settings.destinations).toHaveLength(1);
    expect(r.settings.destinations[0]).toMatchObject({
      name: 'Cloudflare',
      enabled: true,
      target: { kind: 'srt', url: 'srt://live.cloudflare.com:778?streamid=s' },
    });
    expect(typeof r.settings.destinations[0].id).toBe('string');
    expect('target' in r.settings).toBe(false);
  });

  it("does not migrate an old target of kind 'none'", () => {
    const base = initialState();
    const r = restore(JSON.stringify({ ...base, settings: { ...base.settings, target: { kind: 'none' } } }));
    expect(r.settings.destinations).toEqual([]);
  });

  it('drops malformed destinations and keeps valid ones', () => {
    const base = initialState();
    const ok = { id: 'a', name: 'X', enabled: true, target: { kind: 'srt', url: 'srt://h:1' } };
    const r = restore(
      JSON.stringify({
        ...base,
        settings: {
          ...base.settings,
          destinations: [ok, { id: 'b', name: 'Y', enabled: true, target: { kind: 'rtmp', url: 'rtmp://h' } }, 7, { name: 'no id' }],
        },
      }),
    );
    expect(r.settings.destinations).toEqual([ok]);
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

describe('sponsors', () => {
  const sp = (id: string, logoUrl: string | null = `http://127.0.0.1:7311/media/${id.padEnd(32, '0')}`) => ({ id, name: id.toUpperCase(), logoUrl });
  const withSponsors = (...ids: string[]) =>
    ids.reduce((s, id) => showReducer(s, { type: 'addSponsor', sponsor: sp(id) }), initialState());
  const breakOverlay = (s: ShowState) => s.overlays.find((o) => s.templates.find((t) => t.id === o.templateId)?.kind === 'breakSpot')!;

  it('adds, updates and removes partners', () => {
    let s = withSponsors('a', 'b');
    expect(s.sponsors.items.map((i) => i.id)).toEqual(['a', 'b']);
    s = showReducer(s, { type: 'updateSponsor', id: 'a', patch: { name: 'Neu' } });
    expect(s.sponsors.items[0].name).toBe('Neu');
    s = showReducer(s, { type: 'removeSponsor', id: 'a', now: 1 });
    expect(s.sponsors.items.map((i) => i.id)).toEqual(['b']);
  });

  it('addSponsor generates an id when none is given', () => {
    const s = showReducer(initialState(), { type: 'addSponsor', sponsor: { name: 'X', logoUrl: null } });
    expect(s.sponsors.items[0].id).toBeTruthy();
  });

  it('moves partners and ignores out-of-range moves', () => {
    let s = withSponsors('a', 'b', 'c');
    s = showReducer(s, { type: 'moveSponsor', id: 'c', delta: -1 });
    expect(s.sponsors.items.map((i) => i.id)).toEqual(['a', 'c', 'b']);
    expect(showReducer(s, { type: 'moveSponsor', id: 'a', delta: -1 })).toBe(s);
  });

  it('clamps rotationSeconds to 3-60', () => {
    expect(showReducer(initialState(), { type: 'setRotationSeconds', seconds: 1 }).sponsors.rotationSeconds).toBe(3);
    expect(showReducer(initialState(), { type: 'setRotationSeconds', seconds: 500 }).sponsors.rotationSeconds).toBe(60);
    expect(showReducer(initialState(), { type: 'setRotationSeconds', seconds: 12 }).sponsors.rotationSeconds).toBe(12);
    expect(showReducer(initialState(), { type: 'setRotationSeconds', seconds: NaN }).sponsors.rotationSeconds).toBe(8);
  });

  it('startBreak picks the first usable partner and shows the break overlay', () => {
    let s = showReducer(initialState(), { type: 'addSponsor', sponsor: sp('a', null) });
    s = showReducer(s, { type: 'addSponsor', sponsor: sp('b') });
    s = showReducer(s, { type: 'startBreak', now: 100 });
    expect(s.sponsors.breakActive).toBe(true);
    expect(s.sponsors.currentId).toBe('b');
    expect(breakOverlay(s).visible).toBe(true);
  });

  it('startBreak does nothing without a usable partner', () => {
    const s = showReducer(initialState(), { type: 'addSponsor', sponsor: sp('a', null) });
    expect(showReducer(s, { type: 'startBreak', now: 1 })).toBe(s);
    expect(showReducer(s, { type: 'startBreak', now: 1, failedIds: [] }).sponsors.breakActive).toBe(false);
  });

  it('nextSpot rotates and wraps while a break is active, skipping failed ids', () => {
    let s = showReducer(withSponsors('a', 'b', 'c'), { type: 'startBreak', now: 1 });
    s = showReducer(s, { type: 'nextSpot' });
    expect(s.sponsors.currentId).toBe('b');
    s = showReducer(s, { type: 'nextSpot', failedIds: ['c'] });
    expect(s.sponsors.currentId).toBe('a');
  });

  it('nextSpot is a no-op outside a break', () => {
    const s = withSponsors('a', 'b');
    expect(showReducer(s, { type: 'nextSpot' })).toBe(s);
  });

  it('stopBreak hides the overlay and clears the spot', () => {
    let s = showReducer(withSponsors('a'), { type: 'startBreak', now: 1 });
    s = showReducer(s, { type: 'stopBreak', now: 2 });
    expect(s.sponsors).toMatchObject({ breakActive: false, currentId: null });
    expect(breakOverlay(s).visible).toBe(false);
  });

  it('removing the current partner during a break advances, or ends the break when none is left', () => {
    let s = showReducer(withSponsors('a', 'b'), { type: 'startBreak', now: 1 });
    s = showReducer(s, { type: 'removeSponsor', id: 'a', now: 2 });
    expect(s.sponsors.currentId).toBe('b');
    expect(s.sponsors.breakActive).toBe(true);
    s = showReducer(s, { type: 'removeSponsor', id: 'b', now: 3 });
    expect(s.sponsors).toMatchObject({ breakActive: false, currentId: null });
    expect(breakOverlay(s).visible).toBe(false);
  });

  it('restore validates the current spot', () => {
    const base = JSON.parse(serialize(withSponsors('a')));
    base.sponsors.breakActive = true;
    base.sponsors.currentId = 'a';
    expect(restore(JSON.stringify(base)).sponsors).toMatchObject({ breakActive: true, currentId: 'a' });
    base.sponsors.currentId = 'ghost';
    expect(restore(JSON.stringify(base)).sponsors).toMatchObject({ breakActive: false, currentId: null });
    base.sponsors.rotationSeconds = 999;
    expect(restore(JSON.stringify(base)).sponsors.rotationSeconds).toBe(60);
  });
});

describe('sponsor logo safety', () => {
  it('only keeps /media/ capability URLs', () => {
    let s = showReducer(initialState(), { type: 'addSponsor', sponsor: { id: 'a', name: 'A', logoUrl: 'file:///etc/passwd' } });
    expect(s.sponsors.items[0].logoUrl).toBeNull();
    s = showReducer(s, { type: 'updateSponsor', id: 'a', patch: { logoUrl: '/Users/x/logo.png' } });
    expect(s.sponsors.items[0].logoUrl).toBeNull();
    const ok = 'http://127.0.0.1:7311/media/' + 'a'.repeat(32);
    for (const bad of ['http://127.0.0.1:22/media/' + 'a'.repeat(32), ok + '?x=1', ok + '/../..', 'http://127.0.0.1:7311/media/abc', ok + '\n'])
      expect(showReducer(s, { type: 'updateSponsor', id: 'a', patch: { logoUrl: bad } }).sponsors.items[0].logoUrl).toBeNull();
    s = showReducer(s, { type: 'updateSponsor', id: 'a', patch: { logoUrl: ok } });
    expect(s.sponsors.items[0].logoUrl).toBe(ok);
    const r = restore(JSON.stringify({ ...s, sponsors: { ...s.sponsors, items: [{ id: 'b', name: 'B', logoUrl: 'file:///x' }] } }));
    expect(r.sponsors.items[0].logoUrl).toBeNull();
  });
});

describe('break and overlay stay in sync', () => {
  const sp = (id: string) => ({ id, name: id, logoUrl: `http://127.0.0.1:7311/media/${id.padEnd(32, '0')}` });
  const run = () => {
    let s = showReducer(initialState(), { type: 'addSponsor', sponsor: sp('a') });
    s = showReducer(s, { type: 'addSponsor', sponsor: sp('b') });
    return showReducer(s, { type: 'startBreak', now: 1 });
  };
  const ov = (s: ShowState) => s.overlays.find((o) => s.templates.find((t) => t.id === o.templateId)?.kind === 'breakSpot')!;

  it('hiding the break overlay by hand ends the break', () => {
    let s = showReducer(run(), { type: 'toggleOverlay', id: ov(run()).id, now: 5 });
    expect(s.sponsors).toMatchObject({ breakActive: false, currentId: null });
    s = showReducer(run(), { type: 'setOverlay', id: ov(run()).id, visible: false, now: 5 });
    expect(s.sponsors.breakActive).toBe(false);
  });
  it('showing the overlay without a break does not start rotation', () => {
    const s = showReducer(initialState(), { type: 'setOverlay', id: ov(initialState()).id, visible: true, now: 5 });
    expect(s.sponsors.breakActive).toBe(false);
  });
  it('hiding another overlay keeps the break', () => {
    const s0 = run();
    const other = s0.overlays.find((o) => o.id !== ov(s0).id)!;
    expect(showReducer(s0, { type: 'setOverlay', id: other.id, visible: false, now: 5 }).sponsors.breakActive).toBe(true);
  });
  it('removing the logo of the current partner advances the break', () => {
    let s = showReducer(run(), { type: 'updateSponsor', id: 'a', patch: { logoUrl: null }, now: 3 });
    expect(s.sponsors).toMatchObject({ breakActive: true, currentId: 'b' });
    s = showReducer(s, { type: 'updateSponsor', id: 'b', patch: { logoUrl: null }, now: 4 });
    expect(s.sponsors.breakActive).toBe(false);
    expect(ov(s).visible).toBe(false);
  });
});
