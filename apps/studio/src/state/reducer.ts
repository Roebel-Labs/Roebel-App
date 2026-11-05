import type {

  OverlayInstance,
  Scene,
  Settings,
  ShowState,
  Source,
  SponsorItem,
  Table,
  Template,
  TransitionPreset,
} from './types';

export type Action =
  | { type: 'addSource'; source: Omit<Source, 'id'> & { id?: string } }
  | { type: 'updateSource'; id: string; patch: Partial<Omit<Source, 'id'>> }
  | { type: 'removeSource'; id: string }
  | { type: 'addScene'; scene: Omit<Scene, 'id'> & { id?: string } }
  | { type: 'removeScene'; id: string }
  | { type: 'setPreview'; sceneId: string | null }
  | { type: 'take'; now: number }
  | { type: 'cut' }
  | { type: 'transitionDone' }
  | { type: 'setPreset'; presetId: string }
  | { type: 'savePreset'; preset: Omit<TransitionPreset, 'id'> & { id?: string } }
  | { type: 'toggleOverlay'; id: string; now: number }
  | { type: 'setOverlay'; id: string; visible: boolean; now: number }
  | { type: 'updateTemplate'; template: Template }
  | { type: 'setTable'; table: Table }
  | { type: 'updateCell'; rowId: string; column: string; value: string }
  | { type: 'addRow'; values?: Record<string, string> }
  | { type: 'removeRow'; rowId: string }
  | { type: 'selectRow'; rowId: string | null }
  | { type: 'nextRow' }
  | { type: 'updateSettings'; patch: Partial<Settings> };

const STORAGE_PRESETS: TransitionPreset[] = [
  { id: 'preset-cut', name: 'Cut', kind: 'cut', durationMs: 0, easing: 'linear' },
  { id: 'preset-fade', name: 'Blende', kind: 'fade', durationMs: 600, easing: 'easeInOut' },
  { id: 'preset-wipe', name: 'Wischen', kind: 'wipe', durationMs: 600, easing: 'easeInOut', direction: 'left' },
  { id: 'preset-slide', name: 'Schieben', kind: 'slide', durationMs: 600, easing: 'easeOut', direction: 'left' },
  { id: 'preset-zoom', name: 'Zoom', kind: 'zoom', durationMs: 600, easing: 'easeOut' },
];

export function defaultSettings(): Settings {
  return {
    target: { kind: 'none' },
    fps: 30,
    videoKbps: 6000,
    audioKbps: 160,
    recordDir: '~/Movies/Röbel Studio',
    ffmpegPath: '/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg',
  };
}

export function initialState(): ShowState {
  return {
    version: 1,
    sources: [],
    scenes: [],
    previewSceneId: null,
    programSceneId: null,
    transition: { presetId: 'preset-fade', startedAt: null, fromSceneId: null },
    presets: STORAGE_PRESETS.map((p) => ({ ...p })),
    overlays: [],
    templates: [],
    table: { columns: [], rows: [], currentRowId: null },
    settings: defaultSettings(),
    sponsors: { rotationSeconds: 8, items: [] },
  };
}

const uid = () => crypto.randomUUID();

function swap(s: ShowState, now: number | null): ShowState {
  const incoming = s.previewSceneId;
  if (incoming === null) return s;
  const preset = s.presets.find((p) => p.id === s.transition.presetId);
  const animated = now !== null && !!preset && preset.kind !== 'cut' && preset.durationMs > 0;
  return {
    ...s,
    programSceneId: incoming,
    previewSceneId: s.programSceneId,
    transition: {
      ...s.transition,
      startedAt: animated ? now : null,
      fromSceneId: animated ? s.programSceneId : null,
    },
  };
}

function patchOverlay(s: ShowState, id: string, f: (o: OverlayInstance) => OverlayInstance): ShowState {
  return { ...s, overlays: s.overlays.map((o) => (o.id === id ? f(o) : o)) };
}

export function showReducer(s: ShowState, a: Action): ShowState {
  switch (a.type) {
    case 'addSource': {
      const source: Source = { ...a.source, id: a.source.id ?? uid() };
      const scene: Scene = { id: uid(), label: source.label, layout: 'full', sourceIds: [source.id] };
      return { ...s, sources: [...s.sources, source], scenes: [...s.scenes, scene] };
    }
    case 'updateSource':
      return { ...s, sources: s.sources.map((x) => (x.id === a.id ? { ...x, ...a.patch } : x)) };
    case 'removeSource': {
      const gone = new Set(s.scenes.filter((sc) => sc.sourceIds.includes(a.id)).map((sc) => sc.id));
      const clear = (id: string | null) => (id !== null && gone.has(id) ? null : id);
      const hit = s.transition.fromSceneId !== null && gone.has(s.transition.fromSceneId);
      return {
        ...s,
        sources: s.sources.filter((x) => x.id !== a.id),
        scenes: s.scenes.filter((sc) => !gone.has(sc.id)),
        previewSceneId: clear(s.previewSceneId),
        programSceneId: clear(s.programSceneId),
        transition: hit ? { ...s.transition, startedAt: null, fromSceneId: null } : s.transition,
      };
    }
    case 'addScene':
      return { ...s, scenes: [...s.scenes, { ...a.scene, id: a.scene.id ?? uid() }] };
    case 'removeScene':
      return {
        ...s,
        scenes: s.scenes.filter((sc) => sc.id !== a.id),
        previewSceneId: s.previewSceneId === a.id ? null : s.previewSceneId,
        programSceneId: s.programSceneId === a.id ? null : s.programSceneId,
      };
    case 'setPreview':
      return { ...s, previewSceneId: a.sceneId };
    case 'take':
      if (s.transition.startedAt !== null) return s;
      return swap(s, a.now);
    case 'cut':
      return swap(s, null);
    case 'transitionDone':
      return { ...s, transition: { ...s.transition, startedAt: null, fromSceneId: null } };
    case 'setPreset':
      return s.presets.some((p) => p.id === a.presetId) ? { ...s, transition: { ...s.transition, presetId: a.presetId } } : s;
    case 'savePreset': {
      const preset: TransitionPreset = { ...a.preset, id: a.preset.id ?? uid() };
      const exists = s.presets.some((p) => p.id === preset.id);
      return {
        ...s,
        presets: exists ? s.presets.map((p) => (p.id === preset.id ? preset : p)) : [...s.presets, preset],
      };
    }
    case 'toggleOverlay':
      return patchOverlay(s, a.id, (o) => ({ ...o, visible: !o.visible, changedAt: a.now }));
    case 'setOverlay':
      return patchOverlay(s, a.id, (o) => ({ ...o, visible: a.visible, changedAt: a.now }));
    case 'updateTemplate':
      return { ...s, templates: s.templates.map((t) => (t.id === a.template.id ? a.template : t)) };
    case 'setTable':
      return { ...s, table: a.table };
    case 'updateCell':
      return {
        ...s,
        table: {
          ...s.table,
          rows: s.table.rows.map((r) => (r.id === a.rowId ? { ...r, values: { ...r.values, [a.column]: a.value } } : r)),
        },
      };
    case 'addRow': {
      const row = { id: uid(), values: { ...(a.values ?? {}) } };
      return {
        ...s,
        table: { ...s.table, rows: [...s.table.rows, row], currentRowId: s.table.currentRowId ?? row.id },
      };
    }
    case 'removeRow': {
      const i = s.table.rows.findIndex((r) => r.id === a.rowId);
      if (i < 0) return s;
      const rows = s.table.rows.filter((r) => r.id !== a.rowId);
      const currentRowId =
        s.table.currentRowId === a.rowId ? (rows[i] ?? rows[i - 1] ?? null)?.id ?? null : s.table.currentRowId;
      return { ...s, table: { ...s.table, rows, currentRowId } };
    }
    case 'selectRow':
      return { ...s, table: { ...s.table, currentRowId: a.rowId } };
    case 'nextRow': {
      const { rows, currentRowId } = s.table;
      const i = rows.findIndex((r) => r.id === currentRowId);
      const next = rows[i + 1];
      return next ? { ...s, table: { ...s.table, currentRowId: next.id } } : s;
    }
    case 'updateSettings':
      return { ...s, settings: { ...s.settings, ...a.patch } };
  }
}

// ---- persistence ----

export function serialize(s: ShowState): string {
  return JSON.stringify(s);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const arr = <T>(v: unknown, d: T[]): T[] => (Array.isArray(v) ? (v as T[]) : d);
const str = (v: unknown, d: string) => (typeof v === 'string' ? v : d);
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const strOrNull = (v: unknown, d: string | null) => (typeof v === 'string' ? v : v === null ? null : d);

function restoreTarget(v: unknown, d: Settings['target']): Settings['target'] {
  if (!isObj(v)) return d;
  if (v.kind === 'none') return { kind: 'none' };
  if (v.kind === 'srt' && typeof v.url === 'string') return { kind: 'srt', url: v.url };
  if (v.kind === 'rtmp' && typeof v.url === 'string' && typeof v.key === 'string') {
    return { kind: 'rtmp', url: v.url, key: v.key };
  }
  return d;
}

function restoreSettings(v: unknown): Settings {
  const d = defaultSettings();
  if (!isObj(v)) return d;
  return {
    target: restoreTarget(v.target, d.target),
    fps: v.fps === 50 ? 50 : v.fps === 30 ? 30 : d.fps,
    videoKbps: num(v.videoKbps, d.videoKbps),
    audioKbps: num(v.audioKbps, d.audioKbps),
    recordDir: str(v.recordDir, d.recordDir),
    ffmpegPath: str(v.ffmpegPath, d.ffmpegPath),
  };
}

function restoreTable(v: unknown): Table {
  const d = initialState().table;
  if (!isObj(v)) return d;
  return {
    columns: arr<string>(v.columns, d.columns),
    rows: arr<Table['rows'][number]>(v.rows, d.rows).filter((r) => isObj(r) && typeof r.id === 'string' && isObj(r.values)),
    currentRowId: strOrNull(v.currentRowId, null),
  };
}

function restoreSponsors(v: unknown): ShowState['sponsors'] {
  const d = initialState().sponsors;
  if (!isObj(v)) return d;
  return {
    rotationSeconds: num(v.rotationSeconds, d.rotationSeconds),
    items: arr<SponsorItem>(v.items, d.items).filter((i) => isObj(i) && typeof i.id === 'string'),
  };
}

export function restore(json: string | null): ShowState {
  const d = initialState();
  if (!json) return d;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return d;
  }
  if (!isObj(raw)) return d;
  const tr = isObj(raw.transition) ? raw.transition : {};
  const presets = arr<TransitionPreset>(raw.presets, d.presets);
  return {
    version: 1,
    sources: arr<Source>(raw.sources, d.sources),
    scenes: arr<Scene>(raw.scenes, d.scenes),
    previewSceneId: strOrNull(raw.previewSceneId, null),
    programSceneId: strOrNull(raw.programSceneId, null),
    transition: {
      presetId: str(tr.presetId, d.transition.presetId),
      startedAt: null,
      fromSceneId: strOrNull(tr.fromSceneId, null),
    },
    presets: presets.length > 0 ? presets : d.presets,
    overlays: arr<OverlayInstance>(raw.overlays, d.overlays),
    templates: arr<Template>(raw.templates, d.templates),
    table: restoreTable(raw.table),
    settings: restoreSettings(raw.settings),
    sponsors: restoreSponsors(raw.sponsors),
  };
}

