// Layout editor on the preview monitor ("Anordnen"): every layer of the preview scene is a box that can be
// moved and resized with the mouse, snapping to the frame edges, the centre and the other boxes. A split or
// picture-in-picture scene becomes a free scene on the first change (the picture stays exactly as it was).
// Mid-drag the scene lives in arrange.draft (drawn by the preview); the show state changes once, on release.

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { t } from '../../i18n';
import { defaultFrame, resizeRect, sceneLayers, snapLines, snapMove, snapResize, toFreeScene, type Handle, type Rect } from '../../render/layout';
import { useShow } from '../../state/store';
import type { Frame, Scene } from '../../state/types';
import { arrange, useArrange } from './arrange';

const W = 1920;
const H = 1080;
/** Snap distance in program px (≈ 8 screen px on a 960 px monitor). */
const SNAP = 16;
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

type Drag = {
  pointerId: number;
  kind: 'move' | Handle;
  sourceId: string;
  startX: number;
  startY: number;
  /** Program px per screen px. */
  scale: number;
  start: Rect;
  base: Scene;
  moved: boolean;
};

const pct = (v: number, of: number) => `${(v / of) * 100}%`;

function framesOf(scene: Scene): Record<string, Frame> {
  const free = toFreeScene(scene, W, H);
  return free.frames ?? {};
}

function rectOf(scene: Scene, id: string): Rect {
  const l = sceneLayers(scene, W, H).find((x) => x.sourceId === id);
  return l ? l.rect : { x: 0, y: 0, w: W, h: H };
}

export function LayoutEditor({ scene }: { scene: Scene }) {
  const { state, dispatch } = useShow();
  const { selected } = useArrange();
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [draft, setDraftState] = useState<Scene | null>(null);
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const shown = draft ?? scene;
  const layers = sceneLayers(shown, W, H);
  const labelOf = (id: string) => state.sources.find((s) => s.id === id)?.label ?? t('Quelle fehlt');

  const setDraft = (s: Scene | null) => {
    arrange.setDraft(s);
    setDraftState(s);
  };

  // A different preview scene: drop any half-finished drag and a selection that is not in it.
  useEffect(() => {
    setDraft(null);
    drag.current = null;
    if (selected && !scene.sourceIds.includes(selected) && scene.backgroundSourceId !== selected) arrange.select(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene.id]);
  useEffect(() => () => arrange.setDraft(null), []);

  const commit = (next: Scene) => {
    dispatch({
      type: 'updateScene',
      id: next.id,
      patch: { layout: next.layout, sourceIds: next.sourceIds, frames: next.frames, fill: undefined, backgroundSourceId: undefined },
    });
  };

  const withFrame = (base: Scene, id: string, patch: Partial<Frame>): Scene => {
    const free = toFreeScene(base, W, H);
    const frames = { ...(free.frames ?? {}) };
    const cur = frames[id] ?? { ...rectOf(free, id) };
    frames[id] = { ...cur, ...patch };
    return { ...free, frames };
  };

  const onDown = (e: ReactPointerEvent, sourceId: string, kind: Drag['kind']) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const box = ref.current!.getBoundingClientRect();
    const base = toFreeScene(scene, W, H);
    arrange.select(sourceId);
    drag.current = {
      pointerId: e.pointerId,
      kind,
      sourceId,
      startX: e.clientX,
      startY: e.clientY,
      scale: W / box.width,
      start: rectOf(base, sourceId),
      base,
      moved: false,
    };
    ref.current!.setPointerCapture(e.pointerId);
  };

  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const dx = (e.clientX - d.startX) * d.scale;
    const dy = (e.clientY - d.startY) * d.scale;
    if (!d.moved && Math.hypot(dx, dy) < 3 * d.scale) return;
    d.moved = true;
    const others = sceneLayers(d.base, W, H)
      .filter((l) => l.sourceId !== d.sourceId)
      .map((l) => l.rect);
    const lines = snapLines(others, W, H);
    let rect: Rect;
    let gx: number | null = null;
    let gy: number | null = null;
    if (d.kind === 'move') {
      rect = { ...d.start, x: d.start.x + dx, y: d.start.y + dy };
      if (!e.altKey) ({ rect, guideX: gx, guideY: gy } = snapMove(rect, lines, SNAP));
    } else {
      const free = e.shiftKey;
      rect = resizeRect(d.start, d.kind, dx, dy, free);
      // A corner keeps the aspect ratio: snapping one edge would bend it, so corners snap only with Shift.
      const corner = d.kind.length === 2;
      if (!e.altKey && (!corner || free)) ({ rect, guideX: gx, guideY: gy } = snapResize(rect, d.kind, lines, SNAP));
    }
    rect = { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) };
    setGuides({ x: gx, y: gy });
    setDraft(withFrame(d.base, d.sourceId, rect));
  };

  const onUp = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    drag.current = null;
    setGuides({ x: null, y: null });
    const next = arrange.draft();
    if (d.moved && next) commit(next);
    setDraft(null);
  };

  // Keyboard: arrows nudge (Shift = 10 px), Delete removes the layer, Escape ends arranging.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.key === 'Escape') {
        arrange.close();
        return;
      }
      if (!selected || !scene.sourceIds.concat(scene.backgroundSourceId ?? []).includes(selected)) return;
      const step = e.shiftKey ? 10 : 1;
      const delta: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      if (delta[e.key]) {
        e.preventDefault();
        const r = rectOf(toFreeScene(scene, W, H), selected);
        commit(withFrame(scene, selected, { x: r.x + delta[e.key][0], y: r.y + delta[e.key][1] }));
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        removeLayer(selected);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const removeLayer = (id: string) => {
    const free = toFreeScene(scene, W, H);
    if (free.sourceIds.length <= 1) return; // the last layer stays: remove the whole tile instead
    const { [id]: _gone, ...frames } = free.frames ?? {};
    commit({ ...free, sourceIds: free.sourceIds.filter((x) => x !== id), frames });
    arrange.select(null);
  };

  return (
    <div className="arrange" ref={ref} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerDown={() => arrange.select(null)}>
      {layers.map((l) => {
        const sel = l.sourceId === selected;
        return (
          <div
            key={l.sourceId}
            className={`arrange-box${sel ? ' sel' : ''}`}
            style={{ left: pct(l.rect.x, W), top: pct(l.rect.y, H), width: pct(l.rect.w, W), height: pct(l.rect.h, H) }}
            onPointerDown={(e) => onDown(e, l.sourceId, 'move')}
            title={labelOf(l.sourceId)}
          >
            <span className="arrange-label">{labelOf(l.sourceId)}</span>
            {sel &&
              HANDLES.map((h) => (
                <span key={h} className={`arrange-handle h-${h}`} onPointerDown={(e) => onDown(e, l.sourceId, h)} />
              ))}
          </div>
        );
      })}
      {guides.x !== null && <div className="arrange-guide v" style={{ left: pct(guides.x, W) }} />}
      {guides.y !== null && <div className="arrange-guide h" style={{ top: pct(guides.y, H) }} />}
    </div>
  );
}

const RADII: Array<{ label: string; value: number }> = [
  { label: 'Eckig', value: 0 },
  { label: 'Rund', value: 24 },
  { label: 'Kreis', value: 9999 },
];

/** Toolbar under the preview while arranging: layers of the scene, and settings of the selected one. */
export function ArrangeBar({ scene }: { scene: Scene }) {
  const { state, dispatch } = useShow();
  const { selected } = useArrange();
  const free = toFreeScene(scene, W, H);
  const frames = framesOf(scene);
  const frame = selected ? frames[selected] : undefined;
  const layerIds = free.sourceIds;
  const labelOf = (id: string) => state.sources.find((s) => s.id === id)?.label ?? t('Quelle fehlt');
  const addable = state.sources.filter((s) => !layerIds.includes(s.id));

  const commit = (next: Scene) =>
    dispatch({
      type: 'updateScene',
      id: next.id,
      patch: { layout: 'free', sourceIds: next.sourceIds, frames: next.frames, fill: undefined, backgroundSourceId: undefined },
    });
  const patchFrame = (patch: Partial<Frame>) => {
    if (!selected) return;
    const cur = frames[selected] ?? { ...rectOf(free, selected) };
    commit({ ...free, frames: { ...frames, [selected]: { ...cur, ...patch } } });
  };
  const reorder = (dir: 1 | -1) => {
    if (!selected) return;
    const i = layerIds.indexOf(selected);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= layerIds.length) return;
    const ids = [...layerIds];
    [ids[i], ids[j]] = [ids[j], ids[i]];
    commit({ ...free, sourceIds: ids });
  };
  const addLayer = (id: string) => {
    if (!id) return;
    const small = layerIds.filter((x) => {
      const f = frames[x];
      return f && (f.w < W || f.h < H);
    }).length;
    commit({ ...free, sourceIds: [...layerIds, id], frames: { ...frames, [id]: defaultFrame(W, H, small) } });
    arrange.select(id);
  };
  const remove = () => {
    if (!selected || layerIds.length <= 1) return;
    const { [selected]: _gone, ...rest } = frames;
    commit({ ...free, sourceIds: layerIds.filter((x) => x !== selected), frames: rest });
    arrange.select(null);
  };

  const i = selected ? layerIds.indexOf(selected) : -1;
  const radius = frame?.radius ?? 0;
  const fit = frame?.fit ?? 'auto';

  return (
    <div className="arrange-bar">
      <div className="arrange-layers" role="listbox" aria-label={t('Ebenen')}>
        {[...layerIds].reverse().map((id) => (
          <button
            key={id}
            role="option"
            aria-selected={id === selected}
            className={`arrange-chip${id === selected ? ' sel' : ''}`}
            onClick={() => arrange.select(id === selected ? null : id)}
          >
            {labelOf(id)}
          </button>
        ))}
        <select className="input arrange-add" value="" onChange={(e) => addLayer(e.target.value)} disabled={addable.length === 0} aria-label={t('Ebene hinzufügen')}>
          <option value="">{t('+ Ebene')}</option>
          {addable.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      {selected && i >= 0 ? (
        <div className="arrange-tools">
          <div className="arrange-seg" role="group" aria-label={t('Bild im Rahmen')}>
            <button aria-pressed={fit === 'cover'} onClick={() => patchFrame({ fit: 'cover' })} title={t('Rahmen ganz füllen, Ränder werden abgeschnitten')}>
              {t('Füllen')}
            </button>
            <button aria-pressed={fit === 'contain'} onClick={() => patchFrame({ fit: 'contain' })} title={t('Ganzes Bild zeigen')}>
              {t('Einpassen')}
            </button>
          </div>
          <div className="arrange-seg" role="group" aria-label={t('Ecken')}>
            {RADII.map((r) => (
              <button key={r.value} aria-pressed={r.value === 0 ? radius === 0 : r.value === 9999 ? radius >= 9999 : radius > 0 && radius < 9999} onClick={() => {
                  if (r.value !== 9999 || !selected) return patchFrame({ radius: r.value || undefined });
                  // Kreis: a round face cam needs a square box (kept around its centre, picture filling it).
                  const cur = frames[selected] ?? rectOf(free, selected);
                  const side = Math.round(Math.min(cur.w, cur.h));
                  patchFrame({ radius: 9999, x: Math.round(cur.x + (cur.w - side) / 2), y: Math.round(cur.y + (cur.h - side) / 2), w: side, h: side, fit: 'cover' });
                }}>
                {t(r.label)}
              </button>
            ))}
          </div>
          <label className="check">
            <input type="checkbox" checked={!!frame?.border} onChange={(e) => patchFrame({ border: e.target.checked || undefined })} />
            {t('Rahmenlinie')}
          </label>
          <button className="btn ghost small" onClick={() => reorder(1)} disabled={i >= layerIds.length - 1} title={t('Nach vorne')}>
            {t('Nach vorne')}
          </button>
          <button className="btn ghost small" onClick={() => reorder(-1)} disabled={i <= 0} title={t('Nach hinten')}>
            {t('Nach hinten')}
          </button>
          <button className="btn ghost small" onClick={() => patchFrame({ x: 0, y: 0, w: W, h: H })}>
            {t('Vollbild')}
          </button>
          <button className="btn ghost small" onClick={remove} disabled={layerIds.length <= 1}>
            {t('Aus Ansicht entfernen')}
          </button>
        </div>
      ) : (
        <div className="arrange-tools hint">
          {t('Rahmen anklicken und ziehen. Ecken ziehen = Größe (Shift = frei, Alt = ohne Einrasten). Pfeiltasten verschieben.')}
        </div>
      )}
    </div>
  );
}
