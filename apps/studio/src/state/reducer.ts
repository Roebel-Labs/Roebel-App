import { overlayProgress } from '../render/anim';
import { renameInTemplates } from './columns';
import { OVERLAY_PORT } from '../overlay/constants';
import { nextSpot } from '../sponsors/rotation';
import { FORBIDDEN_TEMPLATE_KINDS, STARTER_TEMPLATES, STARTER_VERSION, STARTERS_ADDED_IN, isStarterTemplate, starterTemplates } from '../render/templates';
import type {
  AudioChannel,
  Destination,
  OutputTarget,
  OverlayInstance,
  Scene,
  Settings,
  ShowState,
  Source,
  SponsorItem,
  StreamTarget,
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
  | { type: 'addOverlay'; templateId: string; id?: string }
  | { type: 'removeOverlay'; id: string }
  | { type: 'updateTemplate'; template: Template }
  | { type: 'addTemplate'; template: Template }
  | { type: 'removeTemplate'; id: string }
  | { type: 'resetTemplate'; id: string }
  | { type: 'setTable'; table: Table }
  | { type: 'updateCell'; rowId: string; column: string; value: string }
  | { type: 'addRow'; values?: Record<string, string> }
  | { type: 'removeRow'; rowId: string }
  | { type: 'addColumn'; name: string }
  | { type: 'renameColumn'; from: string; to: string }
  | { type: 'removeColumn'; name: string }
  | { type: 'moveRow'; rowId: string; delta: number }
  | { type: 'selectRow'; rowId: string | null }
  | { type: 'nextRow' }
  | { type: 'updateSettings'; patch: Partial<Settings> }
  | { type: 'addAudioChannel'; channel: Omit<AudioChannel, 'id'> & { id?: string } }
  | { type: 'updateAudioChannel'; id: string; patch: Partial<Omit<AudioChannel, 'id'>> }
  | { type: 'removeAudioChannel'; id: string }
  | { type: 'setMasterDb'; db: number }
  | { type: 'addSponsor'; sponsor: Omit<SponsorItem, 'id'> & { id?: string } }
  | { type: 'updateSponsor'; id: string; patch: Partial<Omit<SponsorItem, 'id'>>; now?: number; failedIds?: string[] }
  | { type: 'removeSponsor'; id: string; now: number; failedIds?: string[] }
  | { type: 'moveSponsor'; id: string; delta: number }
  | { type: 'setRotationSeconds'; seconds: number }
  | { type: 'startBreak'; now: number; failedIds?: string[] }
  | { type: 'stopBreak'; now: number }
  | { type: 'nextSpot'; failedIds?: string[] }
  /** A runtime MediaStream source (Live-Raum guest); the stream lives in media/external.ts. Idempotent per id. */
  | { type: 'addExternalSource'; id: string; label: string }
  | { type: 'removeExternalSource'; id: string }
  /** A destination handed over from the Live-Raum: added switched off, the operator turns it on in Einstellungen. */
  | { type: 'addDestination'; id?: string; name: string; target: StreamTarget };

const STORAGE_PRESETS: TransitionPreset[] = [
  { id: 'preset-cut', name: 'Cut', kind: 'cut', durationMs: 0, easing: 'linear' },
  { id: 'preset-fade', name: 'Blende', kind: 'fade', durationMs: 600, easing: 'easeInOut' },
  { id: 'preset-wipe', name: 'Wischen', kind: 'wipe', durationMs: 600, easing: 'easeInOut', direction: 'left' },
  { id: 'preset-slide', name: 'Schieben', kind: 'slide', durationMs: 600, easing: 'easeOut', direction: 'left' },
  { id: 'preset-zoom', name: 'Zoom', kind: 'zoom', durationMs: 600, easing: 'easeOut' },
];

/** Product rename (Röbel Studio -> Ortis Studio): a stored recordDir equal to the old default moves to the new one. */
export const DEFAULT_RECORD_DIR = '~/Movies/Ortis Studio';
const LEGACY_RECORD_DIR = '~/Movies/Röbel Studio';

export function defaultSettings(): Settings {
  return {
    destinations: [],
    fps: 30,
    videoKbps: 6000,
    audioKbps: 160,
    recordDir: DEFAULT_RECORD_DIR,
    ffmpegPath: '/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg',
  };
}

function starterOverlays(templates: Template[]): OverlayInstance[] {
  // fromProgress 0 = settled hidden (changedAt 0 must not read as "fading out right now").
  return templates.map((t) => ({ id: `ov-${t.id}`, templateId: t.id, visible: false, changedAt: 0, fromProgress: 0 }));
}

export function initialState(): ShowState {
  const templates = starterTemplates();
  return {
    version: 1,
    starterVersion: STARTER_VERSION,
    sources: [],
    scenes: [],
    previewSceneId: null,
    programSceneId: null,
    transition: { presetId: 'preset-fade', startedAt: null, fromSceneId: null },
    presets: STORAGE_PRESETS.map((p) => ({ ...p })),
    overlays: starterOverlays(templates),
    templates,
    table: { columns: [], rows: [], currentRowId: null },
    settings: defaultSettings(),
    sponsors: { rotationSeconds: 8, items: [], breakActive: false, currentId: null },
    audio: { channels: [], masterDb: 0 },
  };
}

const uid = () => crypto.randomUUID();

function swap(s: ShowState, now: number | null): ShowState {
  const incoming = s.previewSceneId;
  if (incoming === null || incoming === s.programSceneId) return s;
  const preset = s.presets.find((p) => p.id === s.transition.presetId);
  const animated = now !== null && s.programSceneId !== null && !!preset && preset.kind !== 'cut' && preset.durationMs > 0;
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

/** Sets visibility, recording the progress at `now` so the next animation continues from there. */
function setVisible(s: ShowState, o: OverlayInstance, visible: boolean, now: number): OverlayInstance {
  const t = s.templates.find((x) => x.id === o.templateId);
  const anim = t ? (o.visible ? t.animIn : t.animOut) : undefined;
  const next: OverlayInstance = { ...o, visible, changedAt: now };
  if (anim) next.fromProgress = overlayProgress(o, anim, now);
  else delete next.fromProgress;
  return next;
}

function dropScenes(s: ShowState, gone: Set<string>): ShowState {
  const clear = (id: string | null) => (id !== null && gone.has(id) ? null : id);
  const hit = s.transition.fromSceneId !== null && gone.has(s.transition.fromSceneId);
  return {
    ...s,
    scenes: s.scenes.filter((sc) => !gone.has(sc.id)),
    previewSceneId: clear(s.previewSceneId),
    programSceneId: clear(s.programSceneId),
    transition: hit ? { ...s.transition, startedAt: null, fromSceneId: null } : s.transition,
  };
}

/** Sponsor logos are broadcast to the OBS page: only /media/ capability URLs from media.allow() are accepted. */
const MEDIA_URL = new RegExp(`^http://127\\.0\\.0\\.1:${OVERLAY_PORT}/media/[0-9a-f]{32}$`);
const safeLogo = (u: unknown): string | null => (typeof u === 'string' && MEDIA_URL.test(u) ? u : null);

/** Hides (or shows) the break-spot overlay(s). */
function setBreakOverlays(s: ShowState, visible: boolean, now: number): ShowState {
  const kindOf = (o: OverlayInstance) => s.templates.find((t) => t.id === o.templateId)?.kind;
  return {
    ...s,
    overlays: s.overlays.map((o) => (kindOf(o) === 'breakSpot' && o.visible !== visible ? setVisible(s, o, visible, now) : o)),
  };
}

/** Hiding the break-spot overlay by hand ends the Werbeblock (no rotation or logging of spots nobody sees). */
function syncBreak(next: ShowState, before: OverlayInstance | undefined): ShowState {
  if (!before || !next.sponsors.breakActive) return next;
  const isBreak = next.templates.find((t) => t.id === before.templateId)?.kind === 'breakSpot';
  const after = next.overlays.find((x) => x.id === before.id);
  if (!isBreak || !after || after.visible) return next;
  return { ...next, sponsors: { ...next.sponsors, breakActive: false, currentId: null } };
}

function endBreak(s: ShowState, now: number): ShowState {
  return { ...setBreakOverlays(s, false, now), sponsors: { ...s.sponsors, breakActive: false, currentId: null } };
}

const externalSceneId = (sourceId: string) => `scene-${sourceId}`;
const externalChannelId = (sourceId: string) => `ach-${sourceId}`;

/** Removes an external source with every scene showing it and its audio channel(s). */
function dropExternal(s: ShowState, id: string): ShowState {
  const gone = new Set(s.scenes.filter((sc) => sc.sourceIds.includes(id)).map((sc) => sc.id));
  const out = dropScenes(s, gone);
  return {
    ...out,
    sources: out.sources.filter((x) => x.id !== id),
    audio: { ...out.audio, channels: out.audio.channels.filter((c) => !(c.input.kind === 'external' && c.input.sourceId === id)) },
  };
}

/** True while a scene showing `sourceId` is on program (or still fading out of it). */
function onAir(s: ShowState, sourceId: string): boolean {
  return s.scenes.some(
    (sc) => sc.sourceIds.includes(sourceId) && (sc.id === s.programSceneId || sc.id === s.transition.fromSceneId),
  );
}

/** Detached external sources disappear as soon as nothing on air shows them any more. */
function pruneDetached(s: ShowState): ShowState {
  let out = s;
  for (const src of s.sources) if (src.kind === 'external' && src.detached && !onAir(out, src.id)) out = dropExternal(out, src.id);
  return out;
}

const forbiddenKind = (t: { kind?: unknown }) => FORBIDDEN_TEMPLATE_KINDS.includes(String(t.kind));

const sameTarget = (a: OutputTarget, b: OutputTarget) => JSON.stringify(a) === JSON.stringify(b);

export function showReducer(s: ShowState, a: Action): ShowState {
  const next = reduce(s, a);
  return a.type === 'take' || a.type === 'cut' || a.type === 'transitionDone' ? pruneDetached(next) : next;
}

function reduce(s: ShowState, a: Action): ShowState {
  switch (a.type) {
    case 'addExternalSource': {
      const existing = s.sources.find((x) => x.id === a.id);
      if (existing) {
        if (existing.kind !== 'external') return s;
        const { detached: _d, ...rest } = existing;
        return { ...s, sources: s.sources.map((x) => (x.id === a.id ? { ...rest, label: a.label } : x)) };
      }
      const source: Source = { id: a.id, kind: 'external', label: a.label };
      const sceneId = externalSceneId(a.id);
      const scenes = s.scenes.some((sc) => sc.id === sceneId)
        ? s.scenes
        : [...s.scenes, { id: sceneId, label: a.label, layout: 'full' as const, sourceIds: [a.id] }];
      const chId = externalChannelId(a.id);
      const channels = s.audio.channels.some((c) => c.id === chId)
        ? s.audio.channels
        : [
            ...s.audio.channels,
            {
              id: chId,
              label: a.label,
              input: { kind: 'external' as const, sourceId: a.id },
              gainDb: 0,
              muted: false,
              delayMs: 0,
              // A guest is heard only while their picture is on program: accepting the doorbell never opens a hot mic.
              followsVideoSourceId: a.id,
            },
          ];
      return { ...s, sources: [...s.sources, source], scenes, audio: { ...s.audio, channels } };
    }
    case 'removeExternalSource': {
      const src = s.sources.find((x) => x.id === a.id);
      if (!src || src.kind !== 'external') return s;
      if (onAir(s, a.id)) return { ...s, sources: s.sources.map((x) => (x.id === a.id ? { ...x, detached: true } : x)) };
      return dropExternal(s, a.id);
    }
    case 'addDestination': {
      if (s.settings.destinations.some((d) => sameTarget(d.target, a.target))) return s;
      const dest: Destination = { id: a.id ?? uid(), name: a.name, enabled: false, target: { ...a.target } };
      return { ...s, settings: { ...s.settings, destinations: [...s.settings.destinations, dest] } };
    }
    case 'addSource': {
      const source: Source = { ...a.source, id: a.source.id ?? uid() };
      const scene: Scene = { id: uid(), label: source.label, layout: 'full', sourceIds: [source.id] };
      return { ...s, sources: [...s.sources, source], scenes: [...s.scenes, scene] };
    }
    case 'updateSource':
      return { ...s, sources: s.sources.map((x) => (x.id === a.id ? { ...x, ...a.patch } : x)) };
    case 'removeSource': {
      // An external source takes its audio channel with it (the operator removed the guest's tile).
      if (s.sources.some((x) => x.id === a.id && x.kind === 'external')) return dropExternal(s, a.id);
      const gone = new Set(s.scenes.filter((sc) => sc.sourceIds.includes(a.id)).map((sc) => sc.id));
      return { ...dropScenes(s, gone), sources: s.sources.filter((x) => x.id !== a.id) };
    }
    case 'addScene':
      return { ...s, scenes: [...s.scenes, { ...a.scene, id: a.scene.id ?? uid() }] };
    case 'removeScene':
      return dropScenes(s, new Set([a.id]));
    case 'setPreview':
      if (a.sceneId !== null && !s.scenes.some((sc) => sc.id === a.sceneId)) return s;
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
    case 'toggleOverlay': {
      const o = s.overlays.find((x) => x.id === a.id);
      return syncBreak(patchOverlay(s, a.id, (x) => setVisible(s, x, !x.visible, a.now)), o);
    }
    case 'setOverlay': {
      const o = s.overlays.find((x) => x.id === a.id);
      return syncBreak(patchOverlay(s, a.id, (x) => setVisible(s, x, a.visible, a.now)), o);
    }
    case 'addOverlay': {
      const id = a.id ?? uid();
      if (!s.templates.some((t) => t.id === a.templateId) || s.overlays.some((o) => o.id === id)) return s;
      return { ...s, overlays: [...s.overlays, { id, templateId: a.templateId, visible: false, changedAt: 0, fromProgress: 0 }] };
    }
    case 'removeOverlay':
      return { ...s, overlays: s.overlays.filter((o) => o.id !== a.id) };
    case 'updateTemplate':
      if (forbiddenKind(a.template)) return s;
      return { ...s, templates: s.templates.map((t) => (t.id === a.template.id ? a.template : t)) };
    case 'addTemplate': {
      if (forbiddenKind(a.template) || s.templates.some((t) => t.id === a.template.id)) return s;
      return {
        ...s,
        templates: [...s.templates, a.template],
        overlays: [...s.overlays, { id: `ov-${a.template.id}`, templateId: a.template.id, visible: false, changedAt: 0, fromProgress: 0 }],
      };
    }
    case 'removeTemplate': {
      // Starters can be reset but never deleted; the show depends on them.
      if (isStarterTemplate(a.id) || !s.templates.some((t) => t.id === a.id)) return s;
      return { ...s, templates: s.templates.filter((t) => t.id !== a.id), overlays: s.overlays.filter((o) => o.templateId !== a.id) };
    }
    case 'resetTemplate': {
      const starter = STARTER_TEMPLATES.find((t) => t.id === a.id);
      if (!starter || !s.templates.some((t) => t.id === a.id)) return s;
      return { ...s, templates: s.templates.map((t) => (t.id === a.id ? structuredClone(starter) : t)) };
    }
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
    case 'addColumn': {
      const name = a.name.trim();
      if (name === '' || s.table.columns.includes(name)) return s;
      return { ...s, table: { ...s.table, columns: [...s.table.columns, name] } };
    }
    case 'renameColumn': {
      const to = a.to.trim();
      if (to === '' || to === a.from || !s.table.columns.includes(a.from) || s.table.columns.includes(to)) return s;
      return {
        ...s,
        templates: renameInTemplates(s.templates, a.from, to),
        table: {
          ...s.table,
          columns: s.table.columns.map((c) => (c === a.from ? to : c)),
          rows: s.table.rows.map((r) => {
            const { [a.from]: moved, ...rest } = r.values;
            return { ...r, values: moved === undefined ? rest : { ...rest, [to]: moved } };
          }),
        },
      };
    }
    case 'removeColumn': {
      if (!s.table.columns.includes(a.name)) return s;
      return {
        ...s,
        table: {
          ...s.table,
          columns: s.table.columns.filter((c) => c !== a.name),
          rows: s.table.rows.map((r) => {
            const { [a.name]: _gone, ...rest } = r.values;
            return { ...r, values: rest };
          }),
        },
      };
    }
    case 'moveRow': {
      const rows = s.table.rows;
      const i = rows.findIndex((r) => r.id === a.rowId);
      const j = i + a.delta;
      if (i < 0 || j < 0 || j >= rows.length || j === i) return s;
      const next = rows.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return { ...s, table: { ...s.table, rows: next } };
    }
    case 'selectRow':
      if (a.rowId !== null && !s.table.rows.some((r) => r.id === a.rowId)) return s;
      return { ...s, table: { ...s.table, currentRowId: a.rowId } };
    case 'nextRow': {
      const { rows, currentRowId } = s.table;
      const i = rows.findIndex((r) => r.id === currentRowId);
      const next = rows[i + 1];
      return next ? { ...s, table: { ...s.table, currentRowId: next.id } } : s;
    }
    case 'updateSettings':
      return { ...s, settings: { ...s.settings, ...a.patch } };
    case 'addAudioChannel': {
      const channel: AudioChannel = { ...a.channel, id: a.channel.id ?? uid() };
      if (s.audio.channels.some((c) => c.id === channel.id)) return s;
      return { ...s, audio: { ...s.audio, channels: [...s.audio.channels, channel] } };
    }
    case 'updateAudioChannel':
      return {
        ...s,
        audio: { ...s.audio, channels: s.audio.channels.map((c) => (c.id === a.id ? { ...c, ...a.patch } : c)) },
      };
    case 'removeAudioChannel':
      return { ...s, audio: { ...s.audio, channels: s.audio.channels.filter((c) => c.id !== a.id) } };
    case 'setMasterDb':
      return { ...s, audio: { ...s.audio, masterDb: a.db } };
    case 'addSponsor': {
      const item: SponsorItem = { ...a.sponsor, logoUrl: safeLogo(a.sponsor.logoUrl), id: a.sponsor.id ?? uid() };
      if (s.sponsors.items.some((x) => x.id === item.id)) return s;
      return { ...s, sponsors: { ...s.sponsors, items: [...s.sponsors.items, item] } };
    }
    case 'updateSponsor': {
      const updated: ShowState = {
        ...s,
        sponsors: { ...s.sponsors, items: s.sponsors.items.map((x) => {
            if (x.id !== a.id) return x;
            const m = { ...x, ...a.patch, id: x.id };
            return 'logoUrl' in a.patch ? { ...m, logoUrl: safeLogo(a.patch.logoUrl) } : m;
          }),
        },
      };
      const cur = updated.sponsors.items.find((x) => x.id === a.id);
      if (!updated.sponsors.breakActive || updated.sponsors.currentId !== a.id || (cur && cur.logoUrl)) return updated;
      // The spot on air lost its logo: move on (or end the break).
      const at = updated.sponsors.items.findIndex((x) => x.id === a.id);
      const i = nextSpot(updated.sponsors.items, new Set(a.failedIds ?? []), at);
      if (i < 0 || updated.sponsors.items[i].id === a.id) return endBreak(updated, a.now ?? Date.now());
      return { ...updated, sponsors: { ...updated.sponsors, currentId: updated.sponsors.items[i].id } };
    }
    case 'removeSponsor': {
      if (!s.sponsors.items.some((x) => x.id === a.id)) return s;
      const items = s.sponsors.items.filter((x) => x.id !== a.id);
      const removed: ShowState = { ...s, sponsors: { ...s.sponsors, items } };
      if (!s.sponsors.breakActive || s.sponsors.currentId !== a.id) return removed;
      const at = s.sponsors.items.findIndex((x) => x.id === a.id);
      const i = nextSpot(items, new Set(a.failedIds ?? []), at - 1);
      if (i < 0) return endBreak(removed, a.now);
      return { ...removed, sponsors: { ...removed.sponsors, currentId: items[i].id } };
    }
    case 'moveSponsor': {
      const items = s.sponsors.items;
      const i = items.findIndex((x) => x.id === a.id);
      const j = i + a.delta;
      if (i < 0 || j < 0 || j >= items.length || j === i) return s;
      const next = items.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return { ...s, sponsors: { ...s.sponsors, items: next } };
    }
    case 'setRotationSeconds': {
      const sec = Number.isFinite(a.seconds) ? Math.min(60, Math.max(3, Math.round(a.seconds))) : 8;
      return { ...s, sponsors: { ...s.sponsors, rotationSeconds: sec } };
    }
    case 'startBreak': {
      if (s.sponsors.breakActive) return s;
      const i = nextSpot(s.sponsors.items, new Set(a.failedIds ?? []), -1);
      if (i < 0) return s;
      const shown = setBreakOverlays(s, true, a.now);
      return { ...shown, sponsors: { ...shown.sponsors, breakActive: true, currentId: s.sponsors.items[i].id } };
    }
    case 'stopBreak':
      return s.sponsors.breakActive ? endBreak(s, a.now) : s;
    case 'nextSpot': {
      if (!s.sponsors.breakActive) return s;
      const at = s.sponsors.items.findIndex((x) => x.id === s.sponsors.currentId);
      const i = nextSpot(s.sponsors.items, new Set(a.failedIds ?? []), at);
      if (i < 0 || s.sponsors.items[i].id === s.sponsors.currentId) return s;
      return { ...s, sponsors: { ...s.sponsors, currentId: s.sponsors.items[i].id } };
    }
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

function restoreTarget(v: unknown): OutputTarget | null {
  if (!isObj(v)) return null;
  if (v.kind === 'none') return { kind: 'none' };
  if (v.kind === 'srt' && typeof v.url === 'string') return { kind: 'srt', url: v.url };
  if (v.kind === 'rtmp' && typeof v.url === 'string' && typeof v.key === 'string') {
    return { kind: 'rtmp', url: v.url, key: v.key };
  }
  return null;
}

function restoreDestination(v: unknown): Destination | null {
  if (!isObj(v) || typeof v.id !== 'string' || typeof v.name !== 'string') return null;
  const target = restoreTarget(v.target);
  if (!target) return null;
  return { id: v.id, name: v.name, enabled: v.enabled !== false, target };
}

function restoreDestinations(v: Record<string, unknown>): Destination[] {
  if (Array.isArray(v.destinations)) {
    return v.destinations.map(restoreDestination).filter((d): d is Destination => d !== null);
  }
  // Before multi-destination output there was one `target` (always Cloudflare in practice).
  const old = restoreTarget(v.target);
  if (!old || old.kind === 'none') return [];
  return [{ id: uid(), name: 'Cloudflare', enabled: true, target: old }];
}

function restoreSettings(v: unknown): Settings {
  const d = defaultSettings();
  if (!isObj(v)) return d;
  return {
    destinations: restoreDestinations(v),
    fps: v.fps === 50 ? 50 : v.fps === 30 ? 30 : d.fps,
    videoKbps: num(v.videoKbps, d.videoKbps),
    audioKbps: num(v.audioKbps, d.audioKbps),
    recordDir: ((r) => (r === LEGACY_RECORD_DIR ? DEFAULT_RECORD_DIR : r))(str(v.recordDir, d.recordDir)),
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
  const items = arr<SponsorItem>(v.items, d.items)
    .filter((i) => isObj(i) && typeof i.id === 'string')
    .map((i) => ({ id: i.id, name: str(i.name, ''), logoUrl: safeLogo(i.logoUrl) }));
  const currentId = typeof v.currentId === 'string' && items.some((i) => i.id === v.currentId) ? v.currentId : null;
  return {
    rotationSeconds: Math.min(60, Math.max(3, num(v.rotationSeconds, d.rotationSeconds))),
    items,
    // A break only resumes with a valid current spot.
    breakActive: v.breakActive === true && currentId !== null,
    currentId: v.breakActive === true ? currentId : null,
  };
}

const hasId = (v: unknown): v is Record<string, unknown> & { id: string } => isObj(v) && typeof v.id === 'string';

function restoreAnim(v: unknown): Template['animIn'] {
  const d: Template['animIn'] = { kind: 'none', durationMs: 0, easing: 'linear' };
  return isObj(v) && typeof v.kind === 'string' && typeof v.durationMs === 'number' && typeof v.easing === 'string'
    ? (v as Template['animIn'])
    : d;
}

function restoreTemplates(v: unknown): Template[] {
  return arr<unknown>(v, [])
    .filter(hasId)
    .map((t) => ({
      ...(t as unknown as Template),
      nodes: arr<unknown>(t.nodes, []).filter(hasId) as unknown as Template['nodes'],
      animIn: restoreAnim(t.animIn),
      animOut: restoreAnim(t.animOut),
    }));
}

function restoreAudio(v: unknown): ShowState['audio'] {
  const d = initialState().audio;
  if (!isObj(v)) return d;
  const channels: AudioChannel[] = [];
  for (const c of arr<unknown>(v.channels, [])) {
    if (!hasId(c) || !isObj(c.input)) continue;
    const i = c.input;
    const input: AudioChannel['input'] | null =
      i.kind === 'device' && typeof i.deviceId === 'string'
        ? { kind: 'device', deviceId: i.deviceId }
        : i.kind === 'source' && typeof i.sourceId === 'string'
          ? { kind: 'source', sourceId: i.sourceId }
          : null;
    if (!input || channels.some((x) => x.id === c.id)) continue;
    const ch: AudioChannel = {
      id: c.id,
      label: str(c.label, ''),
      input,
      gainDb: num(c.gainDb, 0),
      muted: c.muted === true,
      delayMs: Math.min(500, Math.max(0, num(c.delayMs, 0))),
    };
    if (typeof c.followsVideoSourceId === 'string') ch.followsVideoSourceId = c.followsVideoSourceId;
    channels.push(ch);
  }
  return { channels, masterDb: num(v.masterDb, d.masterDb) };
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
  const presetsRaw = arr<unknown>(raw.presets, []).filter(hasId) as unknown as TransitionPreset[];
  const presets = presetsRaw.length > 0 ? presetsRaw : d.presets;
  const allSources = arr<unknown>(raw.sources, []).filter(hasId) as unknown as Source[];
  // External streams (Live-Raum guests) do not survive a restart: drop them with their scenes.
  const external = new Set(allSources.filter((x) => x.kind === 'external').map((x) => x.id));
  const sources = allSources.filter((x) => !external.has(x.id));
  const scenes = arr<unknown>(raw.scenes, [])
    .filter(hasId)
    .map((sc) => ({
      ...(sc as unknown as Scene),
      sourceIds: arr<unknown>(sc.sourceIds, []).filter((x): x is string => typeof x === 'string'),
    }))
    .filter((sc) => !sc.sourceIds.some((id) => external.has(id)));
  // An absent field (state saved before starters existed) gets the starters; an empty array is the operator's choice.
  let overlays =
    raw.overlays === undefined ? d.overlays : (arr<unknown>(raw.overlays, []).filter(hasId) as unknown as OverlayInstance[]);
  let templates = raw.templates === undefined ? d.templates : restoreTemplates(raw.templates);
  // Unterstützungen are never burned into the stream or the recording: drop those templates and their overlays.
  const forbidden = new Set(templates.filter(forbiddenKind).map((t) => t.id));
  if (forbidden.size > 0) {
    templates = templates.filter((t) => !forbidden.has(t.id));
    overlays = overlays.filter((o) => !forbidden.has(o.templateId));
  }
  // Starters introduced after this show was saved are added once (by id, never over a user template).
  const savedVersion = num(raw.starterVersion, 1);
  for (let v = savedVersion + 1; v <= STARTER_VERSION; v++) {
    for (const id of STARTERS_ADDED_IN[v] ?? []) {
      const starter = STARTER_TEMPLATES.find((t) => t.id === id);
      if (!starter || templates.some((t) => t.id === id)) continue;
      templates = [...templates, structuredClone(starter)];
      if (!overlays.some((o) => o.templateId === id || o.id === `ov-${id}`)) {
        overlays = [...overlays, { id: `ov-${id}`, templateId: id, visible: false, changedAt: 0, fromProgress: 0 }];
      }
    }
  }
  const sceneOrNull = (id: string | null) => (id !== null && scenes.some((sc) => sc.id === id) ? id : null);
  const table = restoreTable(raw.table);
  if (table.currentRowId !== null && !table.rows.some((r) => r.id === table.currentRowId)) table.currentRowId = null;
  const presetId = str(tr.presetId, d.transition.presetId);
  return {
    version: 1,
    starterVersion: Math.max(STARTER_VERSION, savedVersion),
    sources,
    scenes,
    previewSceneId: sceneOrNull(strOrNull(raw.previewSceneId, null)),
    programSceneId: sceneOrNull(strOrNull(raw.programSceneId, null)),
    transition: {
      presetId: presets.some((p) => p.id === presetId)
        ? presetId
        : presets.some((p) => p.id === d.transition.presetId)
          ? d.transition.presetId
          : presets[0].id,
      startedAt: null,
      fromSceneId: null,
    },
    presets,
    overlays,
    templates,
    table,
    settings: restoreSettings(raw.settings),
    sponsors: restoreSponsors(raw.sponsors),
    audio: restoreAudio(raw.audio),
  };
}
